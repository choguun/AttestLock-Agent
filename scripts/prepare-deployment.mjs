import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { keccak256 } from 'ethers';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (git('status', '--porcelain') || git('branch', '--show-current') !== 'main')
  throw new Error('Prepare deployment only from clean, merged main.');
const commitSha = git('rev-parse', 'HEAD');
if (commitSha !== git('rev-parse', 'origin/main')) throw new Error('Fetch and synchronize main first.');
if (!process.env.VERIFIED_CI_RUN || !process.env.PROVENANCE_FILE)
  throw new Error('Set VERIFIED_CI_RUN and a new PROVENANCE_FILE path.');
const run = JSON.parse(
  execFileSync('gh', ['api', `repos/choguun/AttestLock-Agent/actions/runs/${process.env.VERIFIED_CI_RUN}`], {
    encoding: 'utf8',
  })
);
if (run.head_sha !== commitSha || run.conclusion !== 'success' || run.name !== 'CI')
  throw new Error('The supplied CI run does not certify this commit.');
execFileSync('forge', ['build', '--root', 'contracts', '--force'], { stdio: 'inherit' });
const artifacts = {};
for (const name of ['MockUSDC', 'LockVault', 'MockUSD', 'CreditPool', 'AttestLockASC']) {
  const artifact = JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`, 'utf8'));
  const metadata = typeof artifact.metadata === 'string' ? JSON.parse(artifact.metadata) : artifact.metadata;
  if (!metadata?.compiler?.version) throw new Error(`${name} compiler metadata is missing.`);
  artifacts[name] = {
    abi: artifact.abi,
    compiler: metadata.compiler,
    settings: metadata.settings,
    creationBytecode: artifact.bytecode.object,
    runtimeBytecode: artifact.deployedBytecode.object,
    immutableReferences: artifact.deployedBytecode.immutableReferences ?? {},
    creationCodeHash: keccak256(artifact.bytecode.object),
    runtimeTemplateCodeHash: keccak256(artifact.deployedBytecode.object),
  };
}
const dependencies = {};
for (const name of ['@gluwa/asc-contracts', '@gluwa/usc-sdk', '@openzeppelin/contracts']) {
  dependencies[name] = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version;
}
await writeFile(
  process.env.PROVENANCE_FILE,
  JSON.stringify(
    {
      schemaVersion: 1,
      commitSha,
      ciRun: run.html_url,
      preparedAt: new Date().toISOString(),
      foundryVersion: execFileSync('forge', ['--version'], { encoding: 'utf8' }).trim(),
      dependencies,
      artifacts,
    },
    null,
    2
  ) + '\n',
  { flag: 'wx', mode: 0o600 }
);
console.log(
  'Created deployment provenance from the CI-certified commit and rebuilt artifacts. Keep this file unchanged with the corresponding broadcasts.'
);
