import { SEPOLIA_CHAIN_KEY, type Job, type JobEvidence, type JobStatus } from '@attestlock/shared';
import { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import { FetchRequest, JsonRpcProvider, Wallet } from 'ethers';
import { AttestcoinProofClient, proofArguments } from './attestcoin-proof-client.js';
import { CreditcoinSubmitter, ascRefusalCode } from './creditcoin-submitter.js';
import type { WorkerConfig } from './env.js';
import type { ChainAdapter, ExecutionResult } from './processor.js';
import {
  ChainReadinessService,
  areContractBindingsValid,
  isActiveAttestation,
  isProofBuilderReady,
  isRelayerFunded,
  isSupportedSourceChain,
  observeAttestationProgress,
  proofBuilderAttestedHeight,
} from './readiness-service.js';
import { SourceLockValidator } from './source-validator.js';
import { DeferredError } from './errors.js';
import type { JobStore } from './store.js';

export {
  ascRefusalCode,
  areContractBindingsValid,
  isActiveAttestation,
  isProofBuilderReady,
  isRelayerFunded,
  isSupportedSourceChain,
  observeAttestationProgress,
  proofArguments,
  proofBuilderAttestedHeight,
};

/** Thin orchestration facade over source validation, proof acquisition, readiness, and submission. */
export class AttestcoinChainAdapter implements ChainAdapter {
  private readonly sourceValidator: SourceLockValidator;
  private readonly proofClient: AttestcoinProofClient;
  private readonly readinessService: ChainReadinessService;
  private readonly submitter: CreditcoinSubmitter;

  constructor(
    private readonly config: WorkerConfig,
    private readonly store: JobStore
  ) {
    const provider = (url: string) => {
      const request = new FetchRequest(url);
      request.timeout = 10_000;
      return new JsonRpcProvider(request);
    };
    const sourceProvider = provider(config.SOURCE_CHAIN_RPC_URL);
    const creditcoinProvider = provider(config.CREDITCOIN_RPC_URL);
    const wallet = new Wallet(config.CREDITCOIN_RELAYER_PRIVATE_KEY, creditcoinProvider);
    const proofBuilder = new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, config.PROOF_BUILDER_URL);
    // The SDK pins its own ethers copy; both providers implement the same EIP-1193 surface.
    const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider as never);
    this.sourceValidator = new SourceLockValidator(
      sourceProvider,
      config.SOURCE_VAULT_ADDRESS,
      config.SOURCE_TOKEN_ADDRESS
    );
    this.proofClient = new AttestcoinProofClient(chainInfoProvider, proofBuilder);
    this.readinessService = new ChainReadinessService(
      config,
      sourceProvider,
      creditcoinProvider,
      wallet,
      chainInfoProvider
    );
    this.submitter = new CreditcoinSubmitter(config, creditcoinProvider, wallet, store);
  }

  readiness() {
    return this.readinessService.check();
  }

  publicStats() {
    return this.submitter.publicStats();
  }

  async execute(
    job: Job,
    transition: (status: JobStatus, evidence?: JobEvidence) => Promise<void>
  ): Promise<ExecutionResult> {
    // Restart reconciliation must not depend on fresh source availability or remaining loan term.
    if (job.evidence.lockId) {
      const recovered = await this.submitter.reconcile(job, job.evidence.lockId);
      if (recovered) return { evidence: recovered };
    }
    const fact = await this.sourceValidator.validate(job);
    await transition('waiting_attestation', {
      blockNumber: fact.blockNumber,
      lockId: fact.lockId,
      collateralAmount: fact.amount.toString(),
      collateralUnlockAt: fact.unlockAt,
    });

    const reconciled = await this.submitter.reconcile(job, fact.lockId);
    if (reconciled) {
      return {
        evidence: {
          ...reconciled,
          processingDurationMs:
            reconciled.processingDurationMs ?? Date.now() - new Date(job.createdAt).getTime(),
        },
      };
    }

    await transition('proving');
    const acquired = await this.proofClient.acquire(job.txHash, fact.blockNumber);
    this.sourceValidator.assertProofMatches(acquired.proof.txBytes, job, fact);
    await transition('preflight', acquired.evidence);
    const readiness = await this.readiness();
    if (!Object.values(readiness.checks).every(Boolean) || !(await this.store.ping()))
      throw new DeferredError('DEPENDENCIES_NOT_READY');
    return {
      evidence: await this.submitter.submit(
        job,
        fact.lockId,
        acquired.evidence,
        proofArguments(acquired.proof),
        transition
      ),
    };
  }
}
