# Attestcoin Protocol

> Research snapshot retained for attribution. Some tutorial paths and package examples in this capture are historical. AttestLock implementation decisions use the current official examples and pinned dependencies listed in `README.md` and `docs/ATTESTCOIN.md`.

In today’s interconnected world, institutions and applications are no longer confined to a single blockchain. Value, data, and users are distributed across many networks, but connecting them securely has remained challenging.&#x20;

The most common solution has been to rely on centralized oracles and bridges, but doing so undermines the very principles that make blockchains trustworthy in the first place. By placing trust in a single oracle operator, institutions expose themselves and their clients to a single point of failure. In such a system, funds can be stolen and data can be falsified.

The diagram below illustrates how a centralized oracle concentrates power and risk in one place.

<figure><img src="/files/oMJdhGF7YNCveZREYBNz" alt=""><figcaption></figcaption></figure>

The Attestcoin Protocol acts as a cross-chain interoperability hub with its own **decentralized oracle infrastructure**. With Attestcoin, smart contracts on [`Creditcoin`](https://creditcoin.org/) gain the ability to read from, and write to, any supported chain.

Attestcoin Protocol solves the problem of cross-chain communication by eliminating the single point of failure: instead of relying on one trusted party that could corrupt or falsify data, trust is distributed across multiple independent parties, none of which can unilaterally manipulate the results. The result is institutional-grade security for third-party cross-chain apps and services.

<figure><img src="/files/fZBD4FRB08dBIM00dqyk" alt=""><figcaption></figcaption></figure>

On the Creditcoin network, apps and services use **Attestcoin Smart Contracts (ASC)**, contracts that interact with the **Attestcoin Protocol**, to execute business logic spanning any number of chains. Operating across many chains simultaneously integrates their isolated pools of information and capital, opening up new powerful business use cases.\
\
This video provides a comprehensive first look into the Attestcoin Protocol (formerly called USC):

{% file src="/files/QyqsMzGI5MYGTG1K4BVW" %}

* **Cross-chain DeFi:**
  * Automating lending, borrowing, trading, and yield farming *without intermediaries*.
  * Creating and managing cryptocurrencies, `NFT`s, and fractional ownership of real-world assets.
  * Facilitating *trustless*, automated payments and conditional fund transfers.
* **Gaming and Metaverse:**
  * Powering in-game economies, item ownership, and where appropriate, the gamification of real world interactions.
  * This is a powerful tool to influence community conscious decision making via incentivisation and fun!
* **Voting and Governance:**
  * Allowing communities to easily establish and interact with novel democratic systems.
  * Contracts can leverage digital identity and the public, immutable ledgers of blockchains to make these systems more secure and truthful than ever before.

All of these uses for blockchain become more powerful when data and liquidity across many chains are usable in one place

## **Current Attestcoin Protocol Oracle Capacity**

* Verification completes in one block (\~15 seconds): Once a source chain (EX: Ethereum) block is finalized and attested on Creditcoin, the Attestcoin Protocol's block prover precompile can validate transactions from that block synchronously. Within the span of a single Creditcoin block, a foreign transaction can be validated, decoded, and used in dApp contract execution.
* Batch query verification supports up to 10 queries which share a continuity proof.


# Architecture

A *decentralized oracle* is a provider of information external to a blockchain that does not rely on a centralized trusted entity for its security. Instead, each step in the oracle’s data provisioning process is executed by a group of independent actors, none of which have the power to unilaterally interfere with data provisioning outcomes.&#x20;

The Attestcoin Protocol adds native decentralized oracle capacity to Creditcoin, which enables smart contracts that can access the state of *any* blockchain. These smart contracts, known as **Attestcoin Smart Contracts** (ASCs), enable novel cross-chain applications that can react to verified events from other chains.

## **Attestcoin Protocol Key Terms** <a href="#usc-key-terms" id="usc-key-terms"></a>

* **Readability:** The process by which the Attestcoin Protocol reads data from another blockchain and exposes it for use in smart contracts on Creditcoin. Events, prices, whatever a contract needs to see.
* **Writability:** The process by which the Attestcoin Protocol sends messages to other blockchains. With writability, a contract on Creditcoin can send messages containing critical data to a destination chain and trigger actions based on that data.
* **Attestcoin Smart Contract (ASC):** A smart contract on Creditcoin that uses Attestcoin Protocol's readability or writability process.
* **Source chain:** A chain from which data is read using Attestcoin readability. We begin by first supporting `EVM` chains such as  `Ethereum`, with the eventual goal to enable data provisioning from any chain.
* **Destination chain:** A chain to which messages are sent using Attestcoin Protocol's writability
* **Creditcoin chain:** Creditcoin mainnet, testnet, or devnet. All these chains have Attestcoin Protocol infrastructure and Attestcoin Smart Contract support.
* **Attestation:** A cryptographic commitment to data from source chain blocks, validated through consensus.
* **Query:** A request to verify a transaction from a source chain on Creditcoin using readability. Each query specifies which source *chain*, *block number*, and *transaction* it wants to be verified. Once a transaction is verified, the dApp's attestcoin smart contract can extract the data it needs from the verified transaction bytes.
* **Proof:** A cryptographic proof certifying that a given transaction occurred on a source chain.

> Proofs consist of Merkle proofs (for transaction inclusion) and continuity proofs (for block chain integrity). These are verified at native speeds on Creditcoin. After verification, dApp contracts can extract relevant transaction data directly from verified transaction bytes.

* **Block Prover Precompile:** A native precompile on Creditcoin (address `0x0FD2`) that verifies queries at native speed. It verifies transaction inclusion and block inclusion using Merkle proofs and continuity proofs. See below for details.

The block prover precompile ***does not*** validate if a transaction was successful or not. It only validates if a transaction is included in a block and that block is really a part of the confirmed source chain. Therefore, a dApp's attestcoin smart contract **MUST** check the "status" field of the transaction to ensure security `0x1` → ✅ **Success**

## Architecture <a href="#architecture" id="architecture"></a>

The Attestcoin Protocol relies primarily on the following actors:

### Attestors <a href="#attestors" id="attestors"></a>

**Role in Readability**

These make assertions about their view of the latest state of a source chain, such as Ethereum. Creditcoin doesn't trust any single attestor's report about changes to a source chain's state. Instead, a decentralized network of attestors must reach consensus on what state changes, if any, have occurred. This consensus is provided as an aggregated signature of individual attestor votes that can be verified by Creditcoin validators.

**Role in Writability**

In writability, attestors play the mirror-image role: instead of verifying facts coming *from* other chains, they validate messages going *to* them. When a contract on Creditcoin publishes a cross-chain message through an Outbox contract, attestors observe the message and then vote to validate it. Once a consensus threshold of signatures is met, the message is considered validated and can be carried to the destination chain.

> For more information on attestors, check out the [Step 1: Attestation](/attestcoin-protocol/attestcoin-readability/step-1-attestation.md) section of the docs.

### Validators <a href="#validators" id="validators"></a>

These form the authority set of the Creditcoin blockchain. Validators receive attestation transactions, perform basic structural checks, and include them in blocks through consensus. The runtime (executed by validators) verifies attestor BLS signatures and checks that sufficient quorum has been reached before committing attestations to on-chain storage.

### Block Prover Precompile <a href="#native-query-verifier-precompile" id="native-query-verifier-precompile"></a>

The block prover precompile is a runtime component at address `0x0FD2` that supports Attestcoin Protocol's readability by verifying cross-chain data within Creditcoin transactions. It validates two proofs: a Merkle proof for transaction inclusion in a block, and a continuity proof linking that block to an on-chain attestation or checkpoint via a chain of block digests.

The precompile runs as compiled Rust code, avoiding EVM interpretation overhead. Verification is synchronous: given transaction data, a Merkle proof, and a continuity proof, it checks that the Merkle root matches the block in the continuity chain, that the chain ends at a valid attestation/checkpoint, and that block digests are correctly linked via cryptographic hashing.

Two functions are available: `verify()` (only view, no events) and `verifyAndEmit()` (state-changing, emits `TransactionVerified` events). ASC contracts use this to verify cross-chain events and transactions in a single transaction, replacing external proof systems and off-chain services.

### Message Relayers

**Role in Writability**

These carry validated messages from Creditcoin to their destination chains. A relayer listens to the attestor P2P network for messages that have reached the consensus signature threshold. Then the relayer delivers each message, along with its collected attestor votes, to an Inbox contract on the destination chain. Relayers are not part of consensus and never vote. Because any tampering would break the attestor signatures checked at the Inbox, a relayer cannot forge, alter, or misroute a message, only deliver it. The role is permissionless: anyone can operate a relayer, no bond is required, and relayers earn a delivery fee for each message they carry.

**Role in Readability**

Relayers can also serve the readability path, generating and submitting transaction proofs on behalf of dApps that prefer not to run their own infrastructure.

## Outcome for Builders <a href="#interoperability" id="interoperability"></a>

**Readability**

The net effect of readability is that third-party builders can create contracts on Creditcoin which have secure, trustless access to verified data from other chains. Attestcoin smart contracts can verify that specific transactions occurred on external blockchains (like Ethereum) and then react to those verified events by executing business logic on Creditcoin.

For example, a bridge contract could:

* Verify that a user burned or locked up ETH on Ethereum (by verifying the burn transaction using the precompile)
* Based on that verified proof, mint equivalent wrapped tokens on Creditcoin

Builders can leverage these properties to create attestcoin smart contracts which support their own custom cross-chain DApp business logic, enabling trustless cross-chain applications without relying on centralized oracles or intermediaries.

**Writability**

The net effect of writability is that Attestcoin Smart Contracts can act beyond Creditcoin: a contract can publish a message that, once validated by attestors, is delivered to a contract on a destination chain and triggers execution there. Builders get verified outbound reach without deploying bridge infrastructure of their own.

Continuing our bridge contract example, with writability the bridge contract could:

* Send a writability message declaring that wrapped ETH tokens were burned by a user
* Receive the signed and verified message on Ethereum, releasing the original locked ETH to the user

Combined with readability, this closes the information loop: builders can prove inbound events, act on them, send verified instructions back out, and even receive delivery confirmation.

> For more information on how to set up your dApp's logic to leverage the Attestcoin protocol, check out the [dApp Builder Infrastructure](/attestcoin-protocol/dapp-builder-infrastructure.md) section of the docs.

#### Conclusion

With readability and writability, the Attestcoin Protocol connects Attestcoin Smart Contracts (ASC) to a growing network of blockchains. With full bi-directional data flows, these contracts seamlessly integrate functionality and liquidity from many chains in one place. This makes the Attestcoin Protocol a cross-chain communication hub with network effects that grow with each connected chain.


# Attestcoin Readability

Attestcoin Protocol's readability allows Creditcoin users and contracts to read the state of any source chain. Readability relies on two key steps:

1. **Attestation** - Proactively tracking and reaching consensus on the state changes of source blockchains.
2. **Transaction Proving** - Once a user/builder has decided they want to read a piece of source chain data, the transaction containing that data must be proven. To save on-chain compute, we generate proofs off-chain then verify them on-chain. Then data from the proven transaction can be used to by smart contracts on Creditcoin.

With these two steps, Creditcoin contracts can connect to many previously isolated pools of data and liquidity.

## **Attestcoin Protocol's Readability Breakdown** <a href="#data-provisioning-flow" id="data-provisioning-flow"></a>

The diagram below depicts how the Attestcoin Protocol provides data from source *chains* to Attestcoin Smart Contracts on Creditcoin.

{% hint style="info" %}
This diagram uses some old terminology and is pending replacement. The term Creditcoin Decentralized Oracle below would now be called "Attestation chain & Block Prover Precompile"
{% endhint %}

<figure><img src="/files/eC8n9W7MvK6w6Rl19C9A" alt=""><figcaption></figcaption></figure>

The diagram above illustrates the cross-chain movement of data using Attestcoin Protocol's readability.&#x20;

### **Provisioning Steps**

* 1-2. Attestors listen for new source chain blocks, vote on attestations, and store those attestations on-chain. These are used later by the Block Prover Precompile to prove source chain transactions.&#x20;
* 3a. Meanwhile, dApp builders listen for the emission of events on the source chain which are relevant to their dApp.&#x20;
* 3b. When an event is detected, dApp builders send a request to the proof generation server asking for proofs of the transaction containing the target event.&#x20;
* 3c. The transaction and proofs are submitted to a dApp's Attestcoin Smart Contract, which forwards them to the Block Prover Precompile.&#x20;
* 4\. The Block Prover Precompile verifies merkle and continuity proofs, signaling whether or not the source chain transaction is valid&#x20;
* 5\. The dApp's Attestcoin Smart Contract decodes the verified transaction, extracting the relevant event. It then uses the event to trigger dApp logic and emit events.

## **Attestcoin Protocol's Readability Example Use Case** <a href="#creditcoin-oracle-example-use-case" id="creditcoin-oracle-example-use-case"></a>

The following diagram demonstrates use of the Attestcoin Protocol (formerly called USC) to power cross-chain loans:

<figure><img src="/files/qndwWddj1AHAKhvwyhWi" alt=""><figcaption></figcaption></figure>

Red arrows represent the attestation process. Blue arrows represent the proving process which generates proofs for queries that are then verified synchronously by the Block Prover Precompile.

# Step 1: Attestation

## **Introduction**

Attestation is the process by which the Attestcoin Protocol keeps track of the confirmed state of source chains. This is the first of two critical steps for Attestcoin Protocol's readability process.&#x20;

State transitions of each source chain are monitored by a decentralized network of attestors. Each eligible attestor creates an attestation, a cryptographic commitment showing its view of new blocks on the source chain and signs it with a BLS signature.&#x20;

Since no single attestor can be fully trusted, we require consensus among independent attestors, achieved through a P2P gossip network that aggregates votes and signatures offline before submitting them on Creditcoin.

## **Attestation Process**

The attestation process is outlined below:<br>

1. Attestors constantly monitor the source chain for new finalized blocks.
2. Periodically, Attestors summarize the new blocks they've seen in an attestation. The new blocks are organized as a chain segment, so that block hashes link from finalized attestation `n` to the new attestation `n + 1`. Eligible Attestors sign their respective attestation votes with BLS signatures and submit them to the P2P gossip network.
3. The off-chain P2P gossip network coordinates the attestation votes, validates them, and aggregates the BLS signatures.
4. Once a quorum of votes for an attestation is reached, any attestor in the active set is free to submit the consensus attestation along with attestor votes on-chain
5. The Creditcoin Validators then verify the aggregated votes (including Attestor eligibility and the aggregated BLS signature), verify the attestation's continuity chain of hashes, and store the attestation on-chain if valid.

This approach reduces on-chain traffic by consolidating multiple attestor votes into a single transaction with a single aggregated signature, enabling efficient scaling to larger Attestor networks.

The following diagram provides a visualization of this process:

<figure><img src="/files/tDAAngQmG5YfkM12eUKF" alt=""><figcaption></figcaption></figure>

# Continuity Proving for Attestation

A continuity proof is one of two key proofs needed by Attestcoin Protocol Readability to securely move data from one chain to another. It organizes source chain blocks into a segment so that each block hash links to the next. Together these hashes/digests ensure that attestation `n + 1` is always a valid descendant of attestation `n`

Why do we need continuity proofs? Why can't attestors simply record consensus about every block? The answer has two parts:&#x20;

1. **On-chain Storage:** Storing attestations for every source chain block on our Creditcoin chain would be too expensive, especially for chains like  `Solana` that produce blocks frequently.
2. &#x20;**Attestor Network Load:** The Attestor network must perform expensive signing, hashing, p2p gossip, and tx submission for every attestation it produces. We make the Attestor networks more resilient and efficient by not attesting to every block.&#x20;

To solve both problems, we produce attestations at larger intervals (e.g., every 10 or 100 source chain blocks). Each attestation links to the previous one via digests. When there's a gap between attestations, a continuity proof fills it. This proof is a chain of digests of intermediate source chain blocks that:

* Starts from the block immediately after the last finalized attestation
* Ends at the block immediately before the new attestation
* Proves each intermediate block links to the previous one via digests

This lets the oracle handle queries for any source chain block—even if it wasn't explicitly stored—by proving continuity through the intermediate blocks. The continuity proof ensures that even though we only store attestations at intervals, we can still verify the integrity of the entire source chain.

## **Key Terms** <a href="#key-terms" id="key-terms"></a>

* **Hash:** A cryptographic hash is a deterministic mathematical function that takes an input of arbitrary size and produces a fixed-size output, called a hash value.
* **Merkle Tree**: A Merkle tree is a balanced binary tree of cryptographic hashes that enables efficient and secure verification of integrity of large data sets. \
  \
  With the tree’s Merkle root and a small subset of hashes (a Merkle proof), one can efficiently verify whether a given piece of data is included in the set without revealing or re-hashing all the data. This property allows us to efficiently determine whether a part of a transaction is contained in the Merkle tree for a given block.
* **Root (Merkle Root)**: A Merkle root is the single cryptographic hash at the top of a Merkle tree. It uniquely summarizes all the data beneath it, allowing us to rapidly verify the integrity of all the data stored in that tree. Root in code:

```rust
let root = eth::starknet_pedersen_mmr(&block_data);
```

* **Digest:** Another term for any output from a hash function. In the context of the Attestcoin Protocol, a digest usually describes the hash output uniquely identifying a block or attestation. The digest of a block is derived by hashing its block number, Merkle root, and previous digest. Digest in code:

```rust
let digest = Self::hash_payload(&block_number.into(), &root, &prev_digest);
```

* **Previous Digest:** The previous digest of a block is just the digest of the block before it. We generate each new block digest using the previous digest.

## **How Hashing "Chains" Blocks Together** <a href="#how-hashing-chains-blocks-together" id="how-hashing-chains-blocks-together"></a>

Continuity proving relies on one of the key properties of blockchains. Namely, that the digest of each block is generated using both the contents of that block and the digest of the previous block. Since each block uses part of the previous block, the blocks are said to form a *chain*. This gives us a very important property:

> If the contents of block `x` are changed, then the digests of blocks `x, x+1, ... x+n` are *all changed* as a result. This allows us to cheaply verify whether any part of the chain was changed using only the most recent block.

## **Generating Attestations** <a href="#generating-attestations" id="generating-attestations"></a>

An attestation is generated using the following process:

### 1. Determine which source chain blocks to attest to <a href="#id-1.-determine-which-source-chain-blocks-to-attest-to" id="id-1.-determine-which-source-chain-blocks-to-attest-to"></a>

This is calculated as:

```rust
let next_attestation_block = latest_attestation_block + attestation_interval;
```

The attestation interval determines how frequently attestations are created on Creditcoin relative to source chain blocks. For example, if the attestation interval for Ethereum is 10, a new attestation is produced on Creditcoin for every 10 blocks on Ethereum. More specifically, if the `attestation_interval` is `10` and the last attestation was at block `100`, attestors will fetch blocks `101-110` and generate new attestation at height `110`.

### 2. Fetch source chain blocks from source chain RPC nodes. <a href="#id-2.-fetch-source-chain-blocks-from-source-chain-rpc-nodes" id="id-2.-fetch-source-chain-blocks-from-source-chain-rpc-nodes"></a>

Attestors either monitor the source chain directly or query an external trusted endpoint of their choice. As long as the attestor population represents a sufficiently diverse and distributed set of endpoints, rather than relying on just a few sources, it doesn't matter if individual attestors use external RPC endpoints.

### 3. Construct an attestation fragment <a href="#id-3.-construct-an-attestation-fragment" id="id-3.-construct-an-attestation-fragment"></a>

Attestors fetch source chain blocks to build a continuity proof, a sequence of digests that bridges from one attestation to the next. As digests are added, each new digest is calculated as:

```rust
let digest = Self::hash_payload(&block_number.into(), &root, &prev_digest);
```

Each block's digest integrates the previous block's digest, forming a verifiable chain. At the end, the new attestation's `prev_digest` is set to the digest of the continuity proof's head block. The attestation itself has its own digest, calculated from the attestation's `root` and `prev_digest`.&#x20;

This allows the attestation to be verified against the entire chain of intermediate digests, proving continuity even when blocks weren't explicitly stored. The following visual shows how digests bridge one attestation to the next.

<figure><img src="/files/ar20gdgOPpVCLkYWV917" alt=""><figcaption></figcaption></figure>

### 4. Sign and submit to gossip network

Each eligible attestor signs their attestation with both a *SR25519* signature (for attestor identity) and a *BLS* signature (for aggregation). The signed attestation (including the continuity proof) is then submitted to the P2P gossip network, where it is validated, coordinated with other Attestors' votes, and aggregated by other Attestors on that same network before on-chain submission.

## **Proving Continuity for Attestations**

{% hint style="info" %}
**Note:** Continuity proof generation for attestations differs from continuity proofs generated for queries (see [Continuity Proving for Queries](/attestcoin-protocol/attestcoin-readability/step-2-transaction-proving/continuity-proving-for-queries.md)). This section focuses specifically on attestation continuity proofs.
{% endhint %}

When generating attestations, Attestors construct a continuity proof chain linking blocks from the last finalized attestation (or checkpoint) to the current attestation height. The process:

* Determines the interval endpoints by finding the last finalized attestation/checkpoint on-chain and identifying the current attestation height
* Fetches source chain blocks between these endpoints and constructs the continuity proof. For attestations, the continuity proof starts from the block after the last finalized attestation and extends to the current attestation height
* Computes block digests using the formula: `digest = hash(block_number, merkle_root, prev_digest)`, creating an unbroken cryptographic chain
* Returns the continuity proof verifying that hashing was done correctly on the input blocks

The attestation includes this continuity proof and a `prev_digest` field. For a continuity proof to be valid, the `prev_digest` of the prospective attestation must match the digest of the last continuity block.

When the attestation is submitted to Creditcoin, the runtime verifies the validity of the continuity proof by reconstructing the digest chain and checking if the final digest matches the attestation's `prev_digest`. If verification succeeds, the attestation is stored on-chain.

### **Security**

If a malicious attestor creates an internally consistent attestation with bogus blocks; the primary defense is consensus - since honest Attestors will not be using the bogus block, their final digest will be different, thus preventing the malicious attestation from reaching quorum. The following visual shows how a faulty attestation is rejected:

<figure><img src="/files/CetKnz1ERLyjlULOLuSg" alt=""><figcaption></figcaption></figure>

# Step 2: Transaction Proving

The query-prove-verify process enables Attestcoin Smart Contracts (ASC) to trustlessly verify and use data from source chains. The process consists of four main phases:

1. **Query Phase**: Identifying the target transaction for verification
2. **Proof Generation Phase**: Creating Merkle and continuity proofs
3. **Verification Phase**: Cryptographic verification of the proofs
4. **Data Extraction Phase**: Extracting transaction data from verified bytes

## **Proof Types**

To prove that a transaction occurred on a source chain, the system uses two complementary cryptographic proofs:

* **Merkle Proofs**: Prove that a specific transaction `x` is part of block `y`&#x20;
* **Continuity Proofs**: Prove that block `y` is part of the finalized source chain

Together, these proofs provide cryptographic certainty that a transaction actually occurred on the source chain, enabling trustless cross-chain applications.

Where are proofs generated, and where are they used?

* **Prover Server** (off-chain): Generates Merkle and continuity proofs on-demand
* [**Block Prover Precompile**](/attestcoin-protocol/architecture.md#native-query-verifier-precompile) (on-chain): Verifies proofs synchronously and extracts data

## Full Process Summary

1. A dApp team or end user identifies a target transaction they want to verify. This is usually done via a **Oracle Query Worker** that listens for source chain events and submits proving requests. Alternatively, for teams that don't want to stand up their own worker, paid 3rd party relayer submission of readability queries will be available in the near future.
2. The **Oracle Query Worker** requests proofs from the **Prover Server** via an endpoint like `proof-by-tx/{chain_key}/{tx_hash}` .&#x20;
3. The **Prover Server** retrieves attestation data from Creditcoin and fetches source chain blocks.
4. The **Prover Server** then uses attestation and block data to construct a continuity proof and a merkle proof for the target tx. These proofs are returned to the **Oracle Query Worker.**
5. The **Oracle Query Worker** submits the target tx and its proofs to Creditcoin via a **Attestcoin Smart Contract** call. There, the tx and proofs are passed to the **Block Prover Precompile**
6. The **Block Prover Precompile** verifies both proofs synchronously, flagging whether the target tx is valid or invalid.&#x20;
7. Once verified, the transaction data can be decoded and used for dApp business logic

# Steps of Transaction Proving

The transaction proving process enables Attestcoin Smart Contracts to trustlessly verify and use data from source chains. The process consists of four main phases:

1. **Query Phase**: Identifying the target transaction for verification
2. **Proof Generation Phase**: Creating Merkle and continuity proofs
3. **Verification Phase**: Cryptographic verification of the proofs
4. **Data Extraction Phase**: Extracting transaction data from verified bytes

## Transaction Proving Visualized

{% @mermaid/diagram content="
sequenceDiagram
participant User as Builder/User
participant SourceChain as Source Chain
participant ProofBuilder as Proof Builder Service
box "Creditcoin (Runtime)"
participant AttestationPallet as Attestation Pallet (Storage)
participant USC as ASC Contract
participant Precompile as Block Prover Precompile
end
Note over User,Precompile: Query Preparation Phase
User->>SourceChain: 1. Fetch Block Data
SourceChain-->>User: Block + Transaction Data
User->>ProofGen: 2. Request Proofs
Note over User,Precompile: Proof Generation
ProofGen->>AttestationPallet: 3. Fetch Attestations/Checkpoints
AttestationPallet-->>ProofGen: Attestation Data
ProofGen->>SourceChain: 4. Fetch Source<br> Chain Blocks
SourceChain-->>ProofGen: Block Headers
ProofGen->>ProofGen: 5. Generate Merkle Proof
ProofGen->>ProofGen: 6. Build Continuity Proof
ProofGen-->>User: Merkle + Continuity Proofs
User->>USC: 7. Submit cross-chain USC call
Note over User,Precompile: Verification Phase
USC->>Precompile: 8. Call Precompile
Precompile->>AttestationPallet: 9. Read Attestations/Checkpoints
AttestationPallet-->>Precompile: Attestation Data
Precompile->>Precompile: 10. Verify Continuity Chain,<br> Merkle Proof, Query Block Digest
Precompile-->>USC: Return Result (bool + data)
Note over User,Precompile: Data Extraction Phase
USC->>USC: 11. Parse data and trigger business logic
USC-->>User: Return result and emit events" %}

### **Phase 1: Query Phase**

A query specifies what needs to be proven:

* Source Chain: Which blockchain the transaction occurred on (identified by `chainKey`)
* Block Height: Which block contains the transaction
* Transaction: The specific transaction to verify (identified by transaction index or hash)

Example: "Prove that transaction at index 5 in block 18,000,000 on Ethereum mainnet actually occurred."

This query information is used to:

* Retrieve transaction data from the source chain
* Determine which source chain blocks need to be fetched
* Identify which attestations are needed for continuity proof

### **Phase 2: Proof Building Phase**

The Proof Builder service creates two complementary proofs that together prove the transaction is legitimate.

#### **2.1 Generating Merkle Proofs**

The service then requests the block at the specified height from a source chain RPC node. All transactions in the block are hashed to form a Merkle tree, with the Merkle root stored in the block header. The Merkle proof consists of:

* The Merkle root (from block header)
* Array of sibling hashes with position information
* The transaction bytes themselves

By providing the sibling hashes and the transaction bytes, anyone can reconstruct the path to the Merkle root. If the computed root matches the block header's root, the transaction is proven to be in that block.

#### **2.2 Generating Continuity Proofs**

Finally the service then takes our query block height and determines that query's attestation bounds. Attestation bounds consist of the closest attestations above and below the query block height.&#x20;

Next, the server fetches all the source chain blocks between our lower and upper attestation bounds. These blocks are used to form a continuity proof as detailed in our next section, [Continuity Proving for Queries](/attestcoin-protocol/attestcoin-readability/step-2-transaction-proving/continuity-proving-for-queries.md)

Now that both proofs have been generated, our Proof Builder returns the following:

* Merkle Proof: Proves transaction inclusion in a block
* Continuity Proof: Proves the block is part of the finalized source chain
* Encoded Transaction: The full transaction bytes (transaction + receipt data)

These three components together provide complete cryptographic proof that the transaction occurred on the source chain.

### **Phase 3: Verification Phase**

The off-chain worker (or user) calls the ASC contract function with the proofs and encoded transaction bytes. The ASC contract then calls the native query verifier precompile to verify the proofs.

#### **3.1 Merkle Proof Verification process:**

* Start with: `leafHash = hash(transaction_bytes)`
* For each sibling: combine with sibling hash (left or right based on position)
* Final step: Check `computedRoot == merkleRoot` (from continuity proof roots array)

#### **3.2 Continuity Proof Verification process:**

* Starting from the back of the continuity chain, compute the following for each block: `computedDigest = hash(block_number, merkleRoot, previousDigest)`
* Final step: Verify that `finalDigest == onChainAttestationDigest`

The verification happens synchronously in the same transaction execution.

* No Waiting: Results are available within seconds
* Atomic: Either all verification steps succeed (transaction continues) or all fail (transaction reverts)
* No Intermediate State: No query storage, no async processing, no waiting for finalization

ASC contracts can use verified data immediately in the same transaction, enabling complex cross-chain logic without multi-step async flows.

### **Phase 4: Data Extraction Phase**

After verification succeeds, the ASC contract extracts the data it needs from the verified transaction bytes. The `encodedTransaction` bytes contain the full transaction data. It can be used to decode the transaction type, common fields, type-specific fields and the receipt fields.

Once data is extracted, the ASC contract:

* Validates the extracted data (e.g., receipt status = success, expected event found)
* Executes business logic based on the verified cross-chain data
* Updates contract state or triggers additional actions

**Example**: A bridge contract might:

1. Verify a `Transfer` event showing tokens were burned on Ethereum
2. Extract the `from`, `to`, and `value` from the event
3. Mint equivalent tokens on Creditcoin to the `to` address

# Continuity Proving for Queries

Continuity proofs for queries are cryptographic proofs that link the queried source chain block to an on-chain attestation or checkpoint, establishing that the block is part of the finalized source chain. This is one of the two essential proving steps used by the Attestcoin Protocol to achieve trustless cross-chain data readability.

{% hint style="info" %}
**Note:** Continuity proof generation for queries differs from continuity proofs used in attestation generation (see [Continuity Proving for Attestation](/attestcoin-protocol/attestcoin-readability/step-1-attestation/continuity-proving-for-attestation.md)). This section focuses specifically on query continuity proofs.
{% endhint %}

## **Continuity Proof**

A continuity proof for a query cryptographically links the queried block to an attestation or checkpoint stored on Creditcoin. The proof structure contains:

* **`lowerEndpointDigest`**: The digest of the block before the query (`queryHeight - 1`), retrieved from indexed attestation data on Creditcoin
* **`roots[]`**: An array of Merkle roots for blocks from `queryHeight` to the attestation/checkpoint block

Digests are computed on-chain from these roots using this formula, which creates an unbroken cryptographic chain:  `digest[i] = hash(blockNumber[i], merkleRoot[i], digest[i-1])`

## **Why Query Continuity Proofs Are Needed**

If queries didn't contain continuity proofs, there would be no way to link them to on-chain attestations. We therefore couldn't verify which queries correspond to legitimate source chain data. Malicious queries could:

* Present fake Merkle roots for non-existent blocks
* Claim transactions exist in blocks that were never finalized
* Use outdated or reorganized blocks

## Attestations vs Checkpoints

Two goals of Attestcoin Protocol Readability are as follows:

1. Allow contracts on Creditcoin to read data from new blocks on source chains as quickly as possible.&#x20;
2. Minimize the long term storage footprint of the attestation protocol which enables readability

In order to accomplish these two goals, attestation record storage on Creditcoin is broken into two pieces.

1. **Attestations**: Records of recent confirmed source chain blocks. New attestations corresponding to the latest source chain blocks are produced frequently (every two minutes for Ethereum)
2. **Checkpoints**: More sparse records covering historical source chain blocks. Checkpoints are produced less frequently (every 20 minutes for Ethereum) and take up much less storage space than attestations. When a checkpoint is produced, it replaces a large number of attestations, removing them from storage.

The Proof Builder service can generate continuity proofs using either attestations or checkpoints. It queries indexed data stored on Creditcoin (attestations and checkpoints) and constructs the continuity proof using the computed roots and digests from this indexed data.

## **Continuity Proof Construction**

When an off-chain worker needs to query a transaction at a specific block height, the service constructs a continuity proof through the following steps:

### **1. Determine Interval Endpoints**

The service first identifies the attestation/checkpoint boundaries around the query:

1. **Find the Highest Attestation/Checkpoint Before the Query**
   * Queries indexed attestation/checkpoint data stored on Creditcoin
   * Identifies the most recent attestation or checkpoint with a block number less than `queryHeight`
   * Retrieves the computed digest from the indexed data to use as `lowerEndpointDigest`
2. **Find the Lowest Attestation/Checkpoint After the Query**
   * Queries indexed attestation/checkpoint data on Creditcoin for the earliest attestation or checkpoint with a block number greater than or equal to `queryHeight`
   * The proof must link to this attestation/checkpoint's digest
   * This serves as the upper endpoint of the continuity proof
   * For queries between checkpoints, this will be a checkpoint (ending in a checkpoint)

**Example:**

* Query height: 145
* Last attestation before query: Block 140 (digest: `0xabc...`)
* Next attestation after query: Block 150 (digest: `0xdef...`)
* Continuity proof must link blocks 145-150 to attestation at block 150

### **2.** Query Indexed Data and **Fetch Source Chain Blocks**

The service queries indexed attestation data on Creditcoin and fetches source chain blocks:

1. **Query Indexed Attestation Data:**
   * For queries between attestations: Retrieves the specific attestations from indexed data
   * For queries between checkpoints: Queries all attestations in the checkpoint interval range from indexed data
   * Uses the computed roots and digests from the indexed attestation data
2. **Fetch Block Headers**
   * Requests block headers from the source chain RPC node
   * Needs blocks from `queryHeight` to the next attestation/checkpoint block
   * Each block header contains: block number, Merkle root, previous block hash
3. **Verify Block Integrity**
   * Validates that blocks form a continuous chain
   * Ensures each block's `previousBlockHash` matches the previous block's hash
   * This ensures blocks haven't been tampered with or reorganized

**Example (continuing from above):**

* Queries indexed attestation data on Creditcoin for blocks 140-150
* Fetches blocks: 144, 145, 146, 147, 148, 149, 150
* Blocks 145-150 form the chain to the attestation

### **3. Construct Digest Chain**

The service constructs the digest chain using the computed roots and digests from the indexed attestation data on Creditcoin:

**Digest Calculation Formula:**

```
digest[i] = hash(blockNumber[i], merkleRoot[i], digest[i-1])
```

Where:

* `blockNumber[i]` is the block number (e.g., 145)
* `merkleRoot[i]` is the Merkle root from the block header
* `digest[i-1]` is the digest of the previous block

**Process:**

1. Start with the digest of the block before the query (`queryHeight - 1`)
   * This digest should match the `prev_digest` from the attestation/checkpoint before the query
   * If no previous attestation exists, use genesis digest
2. For each block from `queryHeight` to the attestation/checkpoint block, compute using roots from indexed data:

   ```
   digest[144] = hash(144, root[144], prev_digest_from_attestation)
   digest[145] = hash(145, root[145], digest[144])
   digest[146] = hash(146, root[146], digest[145])
   ...
   digest[150] = hash(150, root[150], digest[149])
   ```
3. The final digest (`digest[150]`) must match the digest stored in the indexed attestation/checkpoint data on Creditcoin at block 150.&#x20;

### **4. Build Continuity Proof Structure**

The continuity proof structure is simplified and only stores Merkle roots (digests are computed on-chain):

**Continuity Proof Structure:**

```rust
struct ContinuityProof {
    lowerEndpointDigest: bytes32,  // Digest of block (queryHeight - 1)
    roots: bytes32[]            // Array of Merkle roots
}
```

* `lowerEndpointDigest`: The digest of the block before the query (`queryHeight - 1`)
  * This is the `prev_digest` that the first block in the continuity chain references
  * Must match the digest from the attestation/checkpoint before the query
* `roots[]`: Array of Merkle roots for blocks from `queryHeight` to the attestation/checkpoint block
  * Block numbers are derived: `blockNumber = queryHeight + index`
  * Digests are computed on-chain from these roots (not submitted in proof)

## **Security**

The fundamental security property of continuity proofs is the cascading effect of digest changes:

If any block in the continuity proof is modified:

1. The digest of that block changes (because it includes the block's Merkle root)
2. All subsequent block digests change (because each digest includes the previous digest)
3. The final digest will not match the on-chain attestation/checkpoint digest
4. This mismatch can be detected during verification, causing the proof to be rejected

**Example Attack Scenario:**

```
Attacker tries to modify block 147 in the continuity proof:
- Original block 147: root = 0x111, digest = 0xAAA
- Modified block 147: root = 0x222, digest = 0xBBB (changed!)

This causes cascading changes:
- Block 148: digest changes (uses 0xBBB instead of 0xAAA)
- Block 149: digest changes (uses changed digest from 148)
- Block 150: digest changes (uses changed digest from 149)

Final digest ≠ On-chain attestation digest → Tampering detected
```

# Merkle Proving and Transaction Inclusion

> In case you aren't already familiar with Merkle proofs,  :newspaper: [this article](https://medium.com/@swastika0015/merkle-proofs-explained-208a72971a50) should give you a basic understanding of their use in the context of blockchain.

## **Motivation**

When checking whether a transaction is part of a given block, we can either look through all the transactions in that block or use a *Merkle proof*.&#x20;

Blocks can contain a very large number of transactions, so checking them one by one until we find the transaction we are looking  for is *wildly* inefficient! When verifying a Merkle proof we only need to access `log₂(n)` hashes in a block with `n` transactions.&#x20;

This would be about 20 hashes for 1,000,000 transactions! A big difference.

## **Key Terms**

* **Merkle Tree**: A balanced tree data structure of hashes used to efficiently verify the integrity of large sets of data. \
  \
  With the root of a Merkle tree and a small number of hashes from that tree, we can efficiently determine whether any given piece of data belongs to the set it describes. This property allows us to *efficiently* determine whether any transaction `T` is contained in a block `B` , where `B` might contain many such transactions.
* &#x20;**Root (Merkle Root)**: A Merkle root is the single cryptographic hash at the top of a Merkle tree, allowing us to rapidly verify the integrity of all the data stored in that tree.
* **Field**: In this context, a field is a part of a blockchain transaction. For example, a field could be the transaction `status` (success/failure) or the `value` field of a transfer event emitted by that transaction. A dApp's Attestcoin Smart Contract extracts transaction data directly from verified transaction bytes.
* **Standard Merkle Tree**: Attestcoin readability uses standard Merkle trees (*Keccak-256* hashing). Merkle proofs are verified natively by the precompile, providing fast and efficient verification without requiring specialized proof systems.

## **Merkle Proving Transaction Fields**

In the example below, we show how fields containing the data we want are packed in transactions then hashed to form a Merkle tree. `Transaction 1`, as shown below, is an `ERC20` transfer. This implies it has fields such as `from`, `to`, and `value`.

> Other fields have been excluded from this diagram for simplicity's sake.

Note how the transaction fields we want to prove are all part of a single transaction, `T1`. Each transaction in the block is hashed to form a leaf node. These leaf nodes are then combined pairwise and hashed to form parent nodes, with this process continuing recursively until a single `root` hash is created.

Using the hashes of each sibling node along the path to `T1` in combination with the Merkle root itself, we can prove that `T1` was part of this specific block. This is known as a 📰 [Merkle proof](https://medium.com/@swastika0015/merkle-proofs-explained-208a72971a50#c6a9). The Proof Builder service generates this Merkle proof and submits it (along with continuity proof) for verification to the native precompile, which verifies it by reconstructing the path from transaction to root.

Once the precompile has verified the Merkle proof (confirming `T1` is included in the block), the transaction data is immediately available. ASC contracts can then decode the fields they need directly from `T1`.

<figure><img src="/files/185XXI7iwUtcKnlpylXY" alt=""><figcaption></figcaption></figure>

# Source Chain Smart Contracts

{% hint style="danger" %}
Please note that all information and code snippets provided in this section are for educational purposes only and not to be directly deployed in production.
{% endhint %}

## What is a Source Chain Smart Contract?

A source chain smart contract is a contract living on a source chain such as <img src="/files/LGOHRwNlggTXNKAUvsns" alt="Ethereum Icon" data-size="line"> `Ethereum` that is supported by Attestcoin Protocol Readability. Source chain contracts have two main responsibilities:

1. Support any source chain logic required by their cross-chain dApp.
2. Emit events that contain the data their dApp needs to verify and process on Creditcoin

Let's focus on these one by one.

### Source chain logic

Most logic and data for cross-chain DApps should live in contracts on Creditcoin rather than the source chain. Keep source chain logic minimal—typically just enough to handle asset movements (e.g., burning tokens, locking assets) and emit events.

**Best practices:**

* Minimize source chain logic to reduce gas costs and complexity
* Keep business logic on Creditcoin&#x20;
  * So that data and liquidity from many chains can be used in one place
  * And to benefit from lower transaction + storage costs
* Use source chain contracts primarily for emitting events that trigger cross-chain actions

### Emitting Events

This is the way by which the source *chain* will communicate with Creditcoin. When a source chain contract emits an event, it becomes part of the transaction's receipt logs, which can be cryptographically verified on Creditcoin using Attestcoin Protocol Readability.&#x20;

Imagine that you want a simple dApp which burns ERC20 tokens on Ethereum and mints corresponding ERC20 tokens on Creditcoin. Then you would want your source chain smart contract to emit an event such as `TokensBurnedForBridging`.

**Event design considerations:**

* Use `indexed` parameters for efficient filtering (up to 3 indexed parameters)
* Include all data the dApp needs in the event parameters
* Keep event signatures consistent to simplify parsing in ASC contracts

### Example Source chain contract

The following example shows a simple ERC20 contract that supports a token bridge dApp. When tokens are "burned" (transferred to a burn address), a custom `TokensBurnedForBridging` event is emitted, which can be verified on Creditcoin to trigger token minting.

**Key features:**

* Emits a custom `TokensBurnedForBridging` event for easy filtering by [offchain workers](/attestcoin-protocol/dapp-builder-infrastructure/offchain-readability-workers.md)
* Uses a burn address (`0x...01`) to represent token burning
* The `TokensBurnedForBridging` event includes all necessary data (`from`, `value`)
* Workers can easily filter for this specific event signature and then generate proofs to submit to the ASC contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    address public constant BURN_ADDRESS = address(1); // 0x...01

    /// @notice Emitted when tokens are burned (sent to the burn address).
    /// @param from The address burning their tokens
    /// @param value The amount of tokens burned
    event TokensBurnedForBridging(address indexed from, uint256 value);

    constructor() ERC20("Burn Test", "TEST") {
        // Mint sender initial supply
        _mint(msg.sender, 1_000_000 ether);
    }

    /// @notice "Burn" by transferring tokens to the 0x...01 sink address.
    /// @dev This does NOT reduce totalSupply; it only makes tokens inaccessible.
    /// @param amount The amount of tokens to burn
    /// @return success Whether the transfer succeeded
    function burn(uint256 amount) external returns (bool) {
        _transfer(msg.sender, BURN_ADDRESS, amount);
        emit TokensBurnedForBridging(msg.sender, amount);
        return true;
    }
}
```

# Attestcoin Smart Contracts

{% hint style="danger" %}
Please note that all information and code snippets provided in this section are for educational purposes only and not to be directly deployed in production.
{% endhint %}

## What is the Attestcoin Smart Contract?

**Attestcoin Smart Contract (ASC):** A smart contract on Creditcoin that uses Attestcoin Protocol Readability or Writability.

Unlike traditional omnichain or cross-chain solutions that focus narrowly on token transfers or specific assets, the Attestcoin Protocol provides a **general-purpose execution layer**. This enables contracts to act on externally verified data *without needing to rewrite core logic*.&#x20;

By adopting the Attestcoin Protocol into their tech stack, developers can transform their contracts into *universal* components powered by seamless cross-chain data, allowing for novel patterns of interoperability across multiple blockchains.

## Attestcoin Smart Contract Architecture

ASCs verify cross-chain proofs and execute business logic. **DApp Business Logic Contracts** are contracts deployed on Creditcoin that contain the dApp's state and business logic.&#x20;

In the example implementation (`SimpleMinterASC`), the business logic (ERC20 token minting) is integrated directly into the ASC itself. While this combined pattern works well for simple use cases, for more complex dApps developers can separate concerns by deploying distinct contracts:&#x20;

* An Attestcoin smart contract that handles the core cross-chain read/write responsibilities&#x20;
* And separate business logic contracts that the ASC contract calls after verification succeeds.&#x20;

Both patterns are valid; the choice depends on the complexity and requirements of the dApp.

## How it works

ASCs verify cross-chain transaction data using the **Block Prover Precompile** (address `0x0FD2`), a built-in runtime component that provides synchronous verification of Merkle and continuity proofs. &#x20;

ASCs integrate with it by calling its `verify()`  (or alternatively `verifyAndEmit()` ) function directly to verify proofs before processing cross-chain data. Once a transaction is verified, the ASC extracts transaction and event data directly from the verified transaction bytes and executes dApp-specific business logic.

**Key characteristics:**

* **Synchronous verification**: Proofs are verified in the same transaction, no async processing
* **Direct data extraction**: Transaction and event data is extracted directly from verified transaction bytes
* **Replay protection**: ASCs implement mechanisms to prevent duplicate processing
* **Native-speed execution**: The precompile runs as native Rust code for optimal performance

{% hint style="danger" %}
The block prover precompile ***does not*** validate if a transaction was successful or not. It only validates if a transaction is included in a block and that block is really a part of the confirmed source chain. Therefore, a dApp's ASC **MUST** check the "status" field of the transaction to ensure security  `0x1` → ✅ **Success**
{% endhint %}

## Core Attestcoin Smart Contract Pattern

A typical ASC follows this pattern:

1. **Receives proofs and transaction data** from an off-chain worker
2. **Implements replay protection** to prevent duplicate processing
3. **Calls the Block Prover Precompile** to verify proofs synchronously
4. **Extracts transaction/event data** from verified transaction bytes
5. **Executes business logic** based on the verified data

### Example ASC Contract

See [`ASCMinter.sol`](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/contracts/sol/ASCMinter.sol)  for a complete ASC implementation. The contract:

* Receives proofs and transaction data from offchain worker
* Implements replay protection using a `processedQueries` mapping
* Uses the Block Prover Precompile to verify proofs
* Validates transaction type and receipt status (must be successful)
* Extracts event data from verified transaction bytes using `EvmV1Decoder`
* Executes business logic (ERC20 token minting) within the same contract that mints tokens once a burn event is verified from the source chain

**Key function signature:**

```solidity
function mintFromQuery(
    uint64 chainKey,
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    bytes32 merkleRoot,
    INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
    bytes32 lowerEndpointDigest,
    bytes32[] calldata continuityRoots
) external returns (bool success)
```

### dApp Business Logic Contracts

dApp Business Logic Contracts are smart contracts deployed on Creditcoin that contain the dApp's state and business logic.

In the example implementation (`SimpleMinterASC`), the business logic is integrated directly into the ASC. The contract:

* Stores dApp state (e.g., token balances via ERC20)
* Implements dApp-specific logic (e.g., minting tokens)
* Executes business logic immediately after verifying cross-chain proofs and validating transaction contents
* Validates inputs and updates state accordingly

### Transaction Data Extraction

After verification succeeds, ASCs extract transaction and event data from the `encodedTransaction` bytes as part of the transaction content validation process. The transaction encoding follows a deterministic format that includes:

* **Transaction fields**: Type, chain ID, nonce, from address, to address, value, etc.
* **Receipt fields**: Status, gas used, logs (events)
* **Event data**: Topics and data from transaction receipt logs

ASCs can use libraries like `EvmV1Decoder` to selectively extract specific events or transaction fields only needed for their business logic. This selective extraction allows ASCs to efficiently validate specific events or transaction fields needed for their business logic without decoding the entire transaction structure.

### Query Processing Flow

When an oracle query worker provides proof data for a source chain transaction:

1. **Worker generates proofs** using the Proof Builder service
2. **Worker calls ASC contract** with proofs and encoded transaction data
3. **ASC contract verifies proofs** synchronously using the Block Prover Precompile
4. **ASC contract extracts data** from verified transaction bytes
5. **ASC contract executes business logic** immediately in the same transaction

All of this happens synchronously in a single transaction—there is no async query processing or result storage.

### Attestcoin Smart Contract Implementation Example

The following sections break down a complete ASC implementation based on [`ASCMinter.sol`](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/contracts/sol/ASCMinter.sol)&#x20;

{% hint style="danger" %}
Since the creation of this article, the ASCMinter was updated to better reflect a production ready design. The minter responsibilities were split off into several contracts handling portions of the bridge token minting process. The code here, though not fit for production, more simply and succinctly demonstrates ASC design. So it remains unchanged.
{% endhint %}

#### Contract Structure

{% hint style="info" %}
The Block Prover Precompile was previously called Native Query Verifier, so you'll see that term throughout these code examples
{% endhint %}

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EvmV1Decoder} from "./EvmV1Decoder.sol";

contract SimpleMinterASC is ERC20 {
    INativeQueryVerifier public immutable VERIFIER;
    mapping(bytes32 => bool) public processedQueries;

    // ... rest of contract
}
```

**Key components:**

* **Inherits from ERC20**: The contract uses the combined pattern—it's both an ASC (requests proof verification and decodes tx data) and a business logic contract (`ERC20` token with minting logic)
* **VERIFIER**: Immutable reference to the Block Prover Precompile at address `0x0FD2`
* **processedQueries**: Mapping for replay protection, preventing duplicate processing of the same transaction

#### Main Entry Point: mintFromQuery

```solidity
function mintFromQuery(
    uint64 chainKey,
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    bytes32 merkleRoot,
    INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
    bytes32 lowerEndpointDigest,
    bytes32[] calldata continuityRoots
) external returns (bool success) {
    // Calculate transaction index from merkle proof path
    uint256 transactionIndex = _calculateTransactionIndex(siblings);

    // Check if the query has already been processed
    bytes32 txKey;
    {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, chainKey)
            mstore(add(ptr, 32), shl(192, blockHeight))
            mstore(add(ptr, 40), transactionIndex)
            txKey := keccak256(ptr, 72)
        }
        require(!processedQueries[txKey], "Query already processed");
    }

    // First we verify the proof
    bool verified = _verifyProof(
        chainKey, blockHeight, encodedTransaction, merkleRoot, siblings,
        lowerEndpointDigest, continuityRoots
    );
    require(verified, "Verification failed");

    // Mark the query as processed
    processedQueries[txKey] = true;

    // Next we validate the transaction contents
    (bool valid, address burntFrom, uint256 burntValue) = _validateTransactionContents(encodedTransaction);
    require(valid, "Transaction contents validation failed");

    // Execute business logic (mint tokens) corresponding to the burn on the source chain
    _mint(burntFrom, burntValue);

    emit TokensMinted(address(this), burntFrom, burntValue, txKey);

    return true;
}
```

**Description:**

* **Parameters**: Receives all proof components and transaction data from the off-chain worker
* **Transaction Index Calculation**: Calculates the transaction index from the Merkle proof path using `_calculateTransactionIndex()`
* **Transaction Key Generation**: Creates a unique key from `chainKey`, `blockHeight`, and `transactionIndex` using assembly for gas efficiency
* **Replay Protection**: Checks if this transaction has already been processed
* **Proof Verification**: Calls `_verifyProof()` to verify the Merkle and continuity proofs synchronously
* **State Update (replay protection)**: Marks the transaction as processed in `processedQueries` mapping
* **Transaction Content Validation**: Validates the transaction contents by checking transaction type and receipt status.
* **Business Logic Execution:** If validation passes, executes business logic (minting tokens)
* **Event Emission**: Emits `TokensMinted` event with the transaction details

#### Constructor and Initialization

```solidity
constructor() ERC20("Mintable (TEST)", "TEST") {
    // Get the precompile instance using the helper library
    VERIFIER = NativeQueryVerifierLib.getVerifier();
}
```

**Description:**

* Initializes the ERC20 token with name and symbol
* Sets the `VERIFIER` immutable variable to the precompile instance
* The precompile address is constant and always available

#### Replay Protection

```solidity
mapping(bytes32 => bool) public processedQueries;
```

**Description:**

* **processedQueries**: Maps transaction keys to boolean values to track processed transactions

#### Proof Verification

```solidity
function _verifyProof(
    uint64 chainKey,
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    bytes32 merkleRoot,
    INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
    bytes32 lowerEndpointDigest,
    bytes32[] calldata continuityRoots
) internal returns (bool verified) {
    INativeQueryVerifier.MerkleProof memory merkleProof =
        INativeQueryVerifier.MerkleProof({root: merkleRoot, siblings: siblings});

    INativeQueryVerifier.ContinuityProof memory continuityProof =
        INativeQueryVerifier.ContinuityProof({
            lowerEndpointDigest: lowerEndpointDigest,
            roots: continuityRoots
        });

    // Verify inclusion proof
    verified = VERIFIER.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);

    return verified;
}
```

**Description:**

* Constructs the `MerkleProof` and `ContinuityProof` structs from the provided components
* Calls the precompile's `verifyAndEmit()` function synchronously at address `0x0FD2`
* Returns `true` if both Merkle proof (transaction inclusion) and continuity proof (block attestation chain) are valid; reverts on failure (transaction reverts if verification fails)
* Emits `TransactionVerified` event on successful verification
* Verification happens in the same transaction - no async processing

#### Transaction Data Extraction

The contract includes helper functions for extracting and validating transaction data from `encodedTransaction` bytes:

```solidity
function _validateTransactionContents(bytes memory encodedTransaction)
    internal pure returns (bool found, address burntFrom, uint256 burntValue)
{
    // Validate transaction type
    uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
    require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

    // Decode and validate receipt status
    EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
    require(receipt.receiptStatus == 1, "Transaction did not succeed");

    // Find transfer events and validate
    EvmV1Decoder.LogEntry[] memory transferLogs =
        EvmV1Decoder.getLogsByEventSignature(receipt, TRANSFER_EVENT_SIGNATURE);
    require(transferLogs.length > 0, "No transfer events found");

    // Get the original sender
    EvmV1Decoder.CommonTxFields memory txFields = EvmV1Decoder.decodeCommonTxFields(encodedTransaction);

    // Check if there's an actual burn transfer from the sender
    (found, burntFrom, burntValue) = _processTransferLogs(transferLogs, txFields.from);
    require(found, "No valid burn transfer found");

    return (found, burntFrom, burntValue);
}
```

**Description:**

* Uses `EvmV1Decoder` library to decode the transaction bytes
* Validates transaction type and receipt status
* Extracts event logs matching the `Transfer` event signature
* Validates that a burn transfer occurred (transfer to address < 128)

#### Complete Example

See [`ASCMinter.sol`](https://github.com/gluwa/attestcoin-protocol-examples/blob/main/contracts/sol/ASCMinter.sol)  for the complete implementation with all helper functions and event processing logic. A corresponding helper script and instructions to use this code are available in the [hello-bridge example](https://github.com/gluwa/usc-testnet-bridge-examples/tree/main/hello-bridge).

# dApp Design Patterns: Readability

{% hint style="danger" %}
Please note that all information and code snippets provided in this section are for educational purposes only and not to be directly deployed in production.
{% endhint %}

## Attestcoin Protocol Readability Design Patterns

> *How you* **can** *use Attestcoin Readability vs how you* **should**.

Cross-chain dApps use [Attestcoin Smart Contracts](/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.md) in a way that is intended to be *maximally flexible*. With Attestcoin Protocol Readability, data from a source chain such as Ethereum can be securely moved cross-chain by the Attestcoin Protocol. That data can then be verified and used by a dApp's Attestcoin Smart Contract which lives on Creditcoin.

This way, the design space is left open for dApp teams to build whatever source chain logic they want and use Readability to provision whatever data they want.

Most projects, however, are best served by following a specific pattern.

### Source Chain dApp Contract

> *For more detail, read our page covering* [*Source Chain Smart Contracts*](/attestcoin-protocol/dapp-builder-infrastructure/source-chain-smart-contracts.md)*.*

The scope of the source chain dApp contract should be as minimal as possible. It should focus on emitting events with data to be used by the [Attestcoin Smart Contract](/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.md) on Creditcoin.

We want to keep logic on the source chain as *minimal* as possible!

1. Users call a source chain smart contract.
2. (optional) Sometimes there's a piece of business logic which must take place on the source chain. For example, burning tokens. If so then we execute that here before emitting events.
3. The source chain contract emits one or more events.

That's all!

### **Attestcoin Smart Contract**

> *For more detail, read our page covering the* [*Attestcoin Smart Contract*](/attestcoin-protocol/dapp-builder-infrastructure/attestcoin-smart-contracts.md)*.*

We want to make executing the Attestcoin smart contract as *seamless* as possible!

1. An off-chain worker listens for events from the source chain smart contract
2. The worker waits for the block containing the event to be attested on Creditcoin
3. The worker generates Merkle and continuity proofs using the Proof Builder service
4. The worker calls the ASC contract with proofs and encoded transaction data
5. The ASC verifies proofs synchronously using the Block Prover Precompile
6. The ASC executes business logic immediately in the same transaction. Business logic execution either takes place in the ASC itself, or in a separate dApp contract which is called by the ASC.

## Best Practices

Beyond the flow of data described above, we outline some best practices to manage the source chain side of your cross-chain dApp:

1. **An ASC-enabled dApp should have a single source chain contract** which emits all the events relevant to the Attestcoin Protocol. That way, the [offchain worker](/attestcoin-protocol/dapp-builder-infrastructure/offchain-readability-workers.md) building readability queries for your dApp only needs to follow events emitted from a single contract address.
2. **Unambiguous events:** Events should be unambiguous. Try to use unique events for each kind of readability query you want to submit. For instance, a lending dApp tracking loans on Ethereum would want separate events for `LoanInitiated` and `LoanRepaid`.
3. **Clear event naming**: Events should be named so that it's clear they will initiate cross-chain functionality. For instance, the event name `TokensBurnedForBridging` (as used in the examples) clearly indicates a token burn action with the intent to bridge tokens cross-chain.
4. **Avoid common events**: Don't initiate cross-chain functionality using common events such as standard `Transfer` events. Instead, prefer to wrap actions in calls that emit more specific events such as `TokensBurned`. This makes it easier for workers to filter and process the correct events.
5. **Include all necessary data**: Add all the relevant information you want moved cross-chain to the events emitted by the source chain contract. For instance, the `TokensBurned` event should have fields `from` and `value` indicating which account burned the tokens and how many tokens were burned. Otherwise the ASC on Creditcoin won't know which account to mint tokens to or how many.

# Offchain Readability Workers

{% hint style="danger" %}
Please note that all information and code snippets provided in this section are for educational purposes only and not to be directly deployed in production.
{% endhint %}

## **Motivation for Offchain Readability Workers**

{% hint style="info" %}
In the future, 3rd party relayers will offer the submission of readability queries as a service. A dApp team may choose to pay a small fee per readability query rather than maintaining their own worker.
{% endhint %}

When Attestcoin Protocol Readability provisions data from one chain to another, there are two transactions involved:

1. **The user submits a transaction on the source chain.** Usually this would be a source chain smart contract call emitting some event for which we want to transfer data to the execution chain.
2. **The ASC contract must be called on Creditcoin.** This requires generating proofs and submitting a call to the ASC with proofs and encoded transaction data. The ASC verifies the proofs synchronously and executes business logic immediately.

The following diagram highlights where these two transactions take place:

<figure><img src="/files/ItXcWplzBju7Fdv2M79O" alt=""><figcaption></figcaption></figure>

The first transaction must always be submitted by the end user. However, the second transaction can be initiated by an off-chain worker on behalf of the user. Using an off-chain worker provides significant UX and technical benefits:

* **Seamless user experience**: Without a worker, users would need to wait for attestation (several minutes), manually generate proofs, format the proof data correctly, and then submit a second transaction. With a worker, users only need to sign the initial source chain transaction. Everything else happens automatically in the background.
* **Eliminates technical complexity for end users**: Proof generation requires calling the Proof Builder service, waiting for attestation, handling retries, and properly formatting complex proof structures (Merkle proofs, continuity proofs, encoded transactions). Off-chain workers handle all of this complexity automatically, so users don't need to understand the underlying oracle mechanics.
* **Reduces transaction failures and improves reliability**: Workers can implement robust retry logic, handle API failures gracefully, and ensure proper error handling. Users attempting manual proof generation are more likely to encounter failures due to timing issues (submitting before attestation completes), formatting errors, or network problems.
* **Enables better monitoring and observation**: Workers can track processing status, log events, and provide visibility into the cross-chain data flow. This helps DApp teams debug issues and monitor their DApp's health.

## Designing an Offchain Oracle Worker

Using an off-chain worker can drastically improve the UX of your cross-chain DApp by reducing the number of user interactions needed to trigger core business logic on the Creditcoin chain.

### Worker Transaction Flow

The worker automates the following process:

1. **Monitor source chain:** The worker constantly monitors the source chain contract for events (e.g., `TokensBurnedForBridging` events).
2. **Wait for attestation:** When an event is detected, the worker waits for the block containing the event to be attested on Creditcoin.
3. **Generate proofs:** The worker can generate Merkle and continuity proofs via the Proof Builder service.
4. **Call ASC contract:** The worker calls the ASC contract with the proofs and encoded transaction data. The ASC contract verifies the proofs synchronously and executes business logic immediately.
5. **Handle results:** The worker can listen for events from the ASC contract to confirm successful execution.

All of this happens automatically - the user only needs to sign the initial source chain transaction.

{% @mermaid/diagram content="sequenceDiagram
participant User
participant SC as Source Chain<br/>(Smart Contract)
participant Worker as Oracle Worker
participant Attestors as Attestor Network
participant Oracle as Block Prover Precompile
participant ProofBuilder as Proof Builder<br/>Service
participant USC as ASC Contract
participant BusinessLogic as dApp Business Logic<br/>Contract

```
Note over User,BusinessLogic: Phase 1: User Initiates Transaction
User->>SC: Submit Transaction<br/>(e.g., burn tokens)
SC->>SC: Execute Logic & Emit Event

Note over Worker,BusinessLogic: Phase 2: Worker Monitors & Waits
Worker->>SC: Monitor Source Chain<br/>for Events
SC-->>Worker: Event Detected

Note over Attestors: Attestation Process<br/>(happens independently)
Attestors->>SC: Monitor Source Chain<br/>for Blocks
SC-->>Attestors: New Blocks Detected
Attestors->>Oracle: Submit Aggregated Attestation

Worker->>Oracle: Check if Block Attested
Oracle-->>Worker: Block Attested ✓

Note over Worker,BusinessLogic: Phase 3: Generate Proofs
Worker->>ProofAPI: Request Proofs<br/>(chainKey, blockHeight, txHash)

ProofAPI->>Oracle: Fetch Attestations
Oracle-->>ProofAPI: Attestation Data

ProofAPI->>SC: Fetch Source Chain Block
SC-->>ProofAPI: Block Data

ProofAPI->>ProofAPI: Generate Merkle & Continuity Proofs

ProofAPI-->>Worker: Return Proofs & Encoded TX

Note over Worker,BusinessLogic: Phase 4: Verify & Execute
Worker->>USC: Call processCrossChainData()<br/>(proofs + encoded tx)

USC->>Oracle: Verify Proofs<br/>(via precompile)
Oracle->>Oracle: Verify Merkle & Continuity Proofs
Oracle-->>USC: Verification Result: ✓ Valid

USC->>BusinessLogic: Execute Business Logic<br/>(e.g., mint tokens)
BusinessLogic->>BusinessLogic: Update State and Emit Event<br/>(e.g., TokensMinted)

BusinessLogic-->>User: Listens to Dapp events (optional)" %}
```

### Worker Implementation Considerations

This has just been a starting point designed to introduce you to the use of Offchain Workers. Each dApp builder team will likely want to implement their Worker differently to fit the rest of their technology stack.

Keeping this in mind, the main goal of an Offchain Worker should always be robustness. This includes:

* **Retaining stored records of events in progress** in the event of a Worker shutdown
* **Catching up with any event that might have been missed** as a result of an unexpected shutdown
* **Avoiding submitting multiple ASC calls for the same event** (replay protection is handled by the ASC contract, but workers should also track processed events)
* **Following multiple source chain nodes** to listen for events in case a node experiences issues
* **Retrying failed proof generation or ASC calls** in case they fail. A call can fail for many reasons: for example, the Proof Builder services might be experiencing downtime or connectivity issues, or the ASC contract call might fail due to network issues

Below is an example of the logical flow that a more advanced oracle worker might use

{% @mermaid/diagram content="---
config:
theme: neo
----------

stateDiagram
s1:Monitor source chain for events
state if\_events <<choice>>
s2:Event detected
s3:Wait for block attestation
state if\_attested <<choice>>
s4:Generate proofs via Proof Builder Service
state if\_proof\_success <<choice>>
s5:Call ASC contract with proofs
state if\_usc\_success <<choice>>
s6:ASC verifies synchronously
s7:Business logic executed
s8:Success!
retryAttestation:Retry after delay
retryProof:Retry proof generation
retryUSC:Retry ASC call

```
[*] --> s1
s1 --> if_events
if_events --> s2:Yes
if_events --> s1:No
s2 --> s3
s3 --> if_attested
if_attested --> s4:Block attested
if_attested --> retryAttestation:Not yet attested
retryAttestation --> s3
s4 --> if_proof_success
if_proof_success --> s5:Proofs generated
if_proof_success --> retryProof:Service error/retry
retryProof --> s4
s5 --> if_usc_success
if_usc_success --> s6:Transaction submitted
if_usc_success --> retryUSC:Network error/retry
retryUSC --> s5
s6 --> s7
s7 --> s8
s8 --> [*]
```

" fullWidth="true" %}

# Attestcoin SDK (USC SDK)

{% hint style="danger" %}
The term USC (Universal Smart Contract) was replaced with the term Attestcoin Protocol. But repository names and other resources have yet to be updated. The usc-sdk is one such resource.
{% endhint %}

## Getting Started <a href="#getting-started-with-the-usc-sdk" id="getting-started-with-the-usc-sdk"></a>

The `@gluwa/usc-sdk` is a **TypeScript/JavaScript SDK** for verifying cross-chain transactions on the Creditcoin network. It lets you generate inclusion proofs for transactions on supported source chains (e.g. Ethereum Sepolia) and verify them on-chain via Creditcoin's precompile contracts.

### Installation <a href="#installation" id="installation"></a>

```sh
npm install @gluwa/usc-sdk
# or
yarn add @gluwa/usc-sdk
```

The SDK requires [ethers.js v6](https://docs.ethers.org/v6/) as a peer dependency.

### Core concepts <a href="#core-concepts" id="core-concepts"></a>

A **tra*****n*****saction inclusion proof** answers the question: *"Did this transaction really happen on chain X?"* It is made of two parts:

<table><thead><tr><th width="185">Part</th><th>What it proves</th></tr></thead><tbody><tr><td><strong>Merkle proof</strong></td><td>The transaction is included in a specific block's transaction tree</td></tr><tr><td><strong>Continuity proof</strong></td><td>That block is part of a sequence of blocks anchored to an attestation point on Creditcoin</td></tr></tbody></table>

The SDK provides three main components you will work with:

* **`ProofBuilder`** — fetches pre-computed proofs from a hosted builder service (recommended starting point)
* **`PrecompileChainInfoProvider`** — queries attestation state from Creditcoin
* **`PrecompileBlockProver`** — submits proofs to Creditcoin's on-chain verifier

### Step by step guide <a href="#setting-up-providers" id="setting-up-providers"></a>

First you'll need two JSON-RPC providers: one for the **source chain** (where the transaction happened) and one for **Creditcoin** (where proofs are verified).

```typescript
import { JsonRpcProvider } from 'ethers';
import { chainInfo, blockProver, proofProvider } from '@gluwa/usc-sdk';

// Source chain (e.g. Ethereum Sepolia)
const sourceProvider = new JsonRpcProvider('https://sepolia.infura.io/v3/<api_key>'); //or other providers

// Creditcoin CC3 Testnet (CC3 Mainnet only once you are redy for production)
const creditcoinProvider = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network'); //or CC3 Tesnet RPC, https://rpc.cc3-testnet.creditcoin.network
```

#### Step 1: Query supported chains <a href="#step-1-query-supported-chains" id="step-1-query-supported-chains"></a>

Use `PrecompileChainInfoProvider` to see which source chains are currently supported and find the `chainKey` for the chain you want to prove transactions from.

```typescript
const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);

const supportedChains = await chainInfoProvider.getSupportedChains();
console.log(supportedChains);
// [{ chainKey: 1, chainId: 11155111, chainName: 'Ethereum Sepolia', chainEncoding: 1 }, ...]
```

The `chainKey` is a Creditcoin-internal identifier for a source chain — it is **not** the same as the chain's EVM `chainId`. You will need it in every subsequent call.

#### Step 2: Wait for attestation <a href="#step-2-wait-for-attestation" id="step-2-wait-for-attestation"></a>

Before a proof can be generated, the block containing your transaction must be **attested** on Creditcoin. Attestation happens periodically and automatically; you just need to wait for it.

```typescript
const txHash = '0x6fe777442b70a5511f3c443176ae860e50445bd93b663711717996a70c5022ab';
const chainKey = 1; // from Step 1

// Find which block the transaction is in
const tx = await sourceProvider.getTransaction(txHash);
const blockNumber = tx!.blockNumber!;

// We create a connection to the proof builder service. We listen
// for new attestations to be cached here rather than listening for
// them directly on-chain. This prevents request timing issues.
const proofBuilder = new proofProvider.service.ProofBuilder(
  chainKey,
  'https://prover.cc3-testnet.creditcoin.network',
  5000, // request timeout in ms (optional, default: 5000)
);

// Wait until Creditcoin has attested that block
await proofBuilder.waitUntilHeightAttested(chainKey, blockNumber);
console.log(`Block ${blockNumber} is attested — ready to generate proof`);
```

`waitUntilHeightAttested` polls the `proofBuilder` service at a configurable interval (default: `15s`) and resolves once the necessary attestation is present in the prover cache. It will throw after a configurable timeout (default: `15m`).

#### Step 3: Generate a proof with the Prover <a href="#step-3-generate-a-proof-with-the-proof-gen-api" id="step-3-generate-a-proof-with-the-proof-gen-api"></a>

`ProofBuilder` is the simplest way to get a proof. It calls a hosted API that computes and caches proofs on your behalf — no RPC-heavy local computation required.

```typescript
const result = await proofBuilder.getProof(txHash);

if (!result.success) {
  throw new Error(`Proof generation failed: ${result.error}`);
}

const proofData = result.data!;
console.log('Block number:', proofData.headerNumber);
console.log('Transaction bytes:', proofData.txBytes);
```

The returned `proofData` object contains everything needed for on-chain verification:

| Field             | Type                     | Description                                               |
| ----------------- | ------------------------ | --------------------------------------------------------- |
| `chainKey`        | `number`                 | Source chain identifier                                   |
| `headerNumber`    | `number`                 | Block number the transaction was in                       |
| `txHash`          | `string`                 | Transaction hash                                          |
| `txBytes`         | `string`                 | ABI-encoded transaction                                   |
| `merkleProof`     | `TransactionMerkleProof` | Siblings in the block's transaction Merkle tree           |
| `continuityProof` | `ContinuityProof`        | Chain of Merkle roots linking the block to an attestation |
| `cached`          | `boolean`                | Whether the proof was served from cache                   |

#### Batch proof generation <a href="#batch-proof-generation" id="batch-proof-generation"></a>

If you need proofs for multiple transactions at once, use `getBatchProof`. All transactions in a batch share a single continuity proof, which makes on-chain batch verification more efficient. The current `MAX_BATCH_SIZE` is 10 proofs, and these must be within a `MAX_BATCH_RANGE` of 1000 blocks.

```typescript
const batchResult = await proofBuilder.getBatchProof([txHash1, txHash2]);

if (!batchResult.success) {
  throw new Error(`Batch proof generation failed: ${batchResult.error}`);
}

const batchData = batchResult.data!;
```

#### Step 4: Verify the proof on-chain <a href="#step-4-verify-the-proof-on-chain" id="step-4-verify-the-proof-on-chain"></a>

`PrecompileBlockProver` submits proofs to Creditcoin's verifier precompile.

#### Single transaction <a href="#single-transaction" id="single-transaction"></a>

```typescript
const prover = new blockProver.PrecompileBlockProver(creditcoinProvider);

const verified = await prover.verifySingle(
  proofData.chainKey,
  proofData.headerNumber,
  proofData.txBytes,
  proofData.merkleProof,
  proofData.continuityProof,
);

console.log('Verification result:', verified ? 'SUCCESS' : 'FAILED');
```

#### Batch of transactions <a href="#batch-of-transactions" id="batch-of-transactions"></a>

When using batch proofs, you need to flatten the proof data into parallel arrays:

```typescript
const headers: number[] = [];
const txBytesArr: string[] = [];
const merkleProofs = [];

for (const [headerNumber, proofsMap] of batchData.merkleProofs.entries()) {
  for (const [, proofEntry] of proofsMap.entries()) {
    headers.push(headerNumber);
    txBytesArr.push(proofEntry.txBytes);
    merkleProofs.push(proofEntry.merkleProof);
  }
}

const batchVerified = await prover.verifyBatch(
  batchData.chainKey,
  headers,
  txBytesArr,
  merkleProofs,
  batchData.continuityProof,
);

console.log('Batch verification result:', batchVerified ? 'SUCCESS' : 'FAILED');
```

### Complete end-to-end example <a href="#complete-end-to-end-example" id="complete-end-to-end-example"></a>

<pre class="language-typescript"><code class="lang-typescript">import { JsonRpcProvider } from 'ethers';
import { chainInfo, blockProver, proofProvider } from '@gluwa/usc-sdk';

async function proveTransaction(txHash: string) {
<strong>  // Resolve chain key
</strong>  const chainKey = 1; // Ethereum Sepolia on CC3 Testnet

  // Providers
  const sourceProvider = new JsonRpcProvider('https://sepolia.infura.io/v3/&#x3C;api_key>'); //or other providers
  const creditcoinProvider = new JsonRpcProvider('https://rpc.cc3-testnet.creditcoin.network');

  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
  const prover = new blockProver.PrecompileBlockProver(creditcoinProvider);
  const proofBuilder = new proofProvider.service.ProofBuilder(
    chainKey,
    'https://prover.cc3-testnet.creditcoin.network',
  );

  // Find block and wait for attestation
  const tx = await sourceProvider.getTransaction(txHash);
  await proofBuilder.waitUntilHeightAttested(chainKey, tx!.blockNumber!);

  // Generate proof via API
  const result = await proofBuilder.getProof(txHash);

  if (!result.success || !result.data) {
    throw new Error(`Proof generation failed: ${result.error}`);
  }

  const { chainKey: ck, headerNumber, txBytes, merkleProof, continuityProof } = result.data;

  // Verify on-chain
  const verified = await prover.verifySingle(ck, headerNumber, txBytes, merkleProof, continuityProof);
  console.log('Proof verification:', verified ? 'SUCCESS' : 'FAILED');

  return verified;
}
</code></pre>

### Alternative: Raw proof generator <a href="#alternative-raw-proof-generator" id="alternative-raw-proof-generator"></a>

For advanced use cases where you need full control (e.g. running your own indexer, offline proof computation, or custom block providers), the SDK also ships a `RawProofBuilder` that computes proofs locally by fetching data directly from source chain RPCs.

```typescript
import { EncodingVersion } from '@gluwa/usc-sdk/encoding';

const blockProvider = new proofProvider.raw.blockProvider.SimpleBlockProvider(sourceProvider);
const rawGenerator = new proofProvider.raw.RawProofBuilder(
  chainKey,
  blockProvider,
  chainInfoProvider,
  EncodingVersion.V1,
);

const result = await rawGenerator.getProof(txHash);
```

Both `RawProofBuilder` and `ProofBuilder` implement the same `ProofProvider` interface and produce identical output, so you can swap between them without changing any downstream code.

# Attestcoin Protocol Chains - Environments

### CC3 Mainnet <a href="#cc3-testnet" id="cc3-testnet"></a>

<table data-header-hidden><thead><tr><th width="215"></th><th></th></tr></thead><tbody><tr><td>ASC Dashboard</td><td><a href="https://dashboard.cc3-mainnet-usc.creditcoin.network/">https://dashboard.cc3-mainnet-usc.creditcoin.network/</a></td></tr><tr><td>Proof Builder API</td><td><a href="https://proofbuilder.cc3-mainnet-usc.creditcoin.network/">https://proofbuilder.cc3-mainnet-usc.creditcoin.network/</a><br><br>To view a swagger, please use testnet version.</td></tr><tr><td>Decoder contract</td><td>0x9D094C9f22B10FCf842c2fC6A0981630A4F94B5C</td></tr><tr><td>ChainInfo Precompile</td><td>0x0000000000000000000000000000000000000fd3</td></tr><tr><td>BlockProver Precompile</td><td>0x0000000000000000000000000000000000000FD2</td></tr><tr><td>SDK</td><td><a href="https://www.npmjs.com/package/@gluwa/usc-sdk">https://www.npmjs.com/package/@gluwa/usc-sdk</a></td></tr></tbody></table>

| **Supported Mainnet Chains** | **Chainkey** | **Genesis Block** |
| ---------------------------- | ------------ | ----------------- |
| Ethereum Mainnet             | 1            | 0                 |

### CC3 Testnet <a href="#cc3-testnet" id="cc3-testnet"></a>

<table data-header-hidden><thead><tr><th width="215"></th><th></th></tr></thead><tbody><tr><td>ASC Dashboard</td><td><a href="https://dashboard.cc3-testnet.creditcoin.network/">https://dashboard.cc3-testnet.creditcoin.network/</a></td></tr><tr><td>Proof builder API</td><td><a href="https://proof-gen-api.cc3-testnet.creditcoin.network/">https://proof-gen-api.cc3-testnet.creditcoin.network/</a></td></tr><tr><td>Decoder contract</td><td>0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f</td></tr><tr><td>ChainInfo Precompile</td><td>0x0000000000000000000000000000000000000fd3</td></tr><tr><td>BlcokProver Precompile</td><td>0x0000000000000000000000000000000000000FD2</td></tr><tr><td>SDK</td><td><a href="https://www.npmjs.com/package/@gluwa/usc-sdk">https://www.npmjs.com/package/@gluwa/usc-sdk</a></td></tr></tbody></table>

| **Supported Testnet Chains** | **Chainkey** | **Genesis Block** |
| ---------------------------- | ------------ | ----------------- |
| Ethereum Sepolia             | 1            | 0                 |
| Ethereum Mainnet             | 3            | 0                 |
