export const mockUsdcAbi = [
  'function faucet()',
  'function faucetClaimed(address) view returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
] as const;

export const lockVaultAbi = [
  'function collateralToken() view returns (address)',
  'function lock(uint256 amount,uint64 unlockAt) returns (bytes32 lockId)',
  'function withdraw(bytes32 lockId)',
  'event CollateralLocked(bytes32 indexed lockId,address indexed borrower,address indexed token,uint256 amount,uint64 unlockAt)',
] as const;

export const attestLockAscAbi = [
  'function verifyLockAndOpenLine(uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,tuple(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) returns (bool)',
  'function pool() view returns (address)',
  'function processedQueries(bytes32) view returns (bool)',
  'function usedLocks(bytes32) view returns (bool)',
  'event LockVerifiedAndLineOpened(bytes32 indexed queryId,bytes32 indexed lockId,address indexed borrower,uint256 collateralAmount,uint256 creditLimit,uint64 maturity,uint64 collateralUnlockAt)',
  'error UnsupportedChain()',
  'error QueryAlreadyProcessed()',
  'error ProofVerificationFailed()',
  'error UnsupportedTransactionType()',
  'error SourceTransactionFailed()',
  'error MissingLockEvent()',
  'error AmbiguousLockEvents()',
  'error MalformedLockEvent()',
  'error UnsupportedToken()',
  'error CollateralBelowMinimum()',
  'error InsufficientRemainingLock()',
  'error LockAlreadyUsed()',
] as const;

export const creditPoolAbi = [
  'function lines(bytes32) view returns (address borrower,uint256 limit,uint256 debt,uint64 maturity,uint256 collateralAmount,uint64 collateralUnlockAt,bytes32 queryId)',
  'function borrow(bytes32 lockId,uint256 amount)',
  'function repay(bytes32 lockId,uint256 amount) returns (uint256 paid)',
  'event CreditLineOpened(bytes32 indexed lockId,address indexed borrower,uint256 limit,uint64 maturity,bytes32 indexed queryId)',
  'event Borrowed(bytes32 indexed lockId,address indexed borrower,uint256 amount,uint256 debt)',
] as const;

export const mockUsdAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
] as const;
