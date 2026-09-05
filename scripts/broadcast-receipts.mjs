/** Resolve CREATE receipts by their on-chain address, never by parallel broadcast array order. */
export function resolveCreationReceipt(creation, receipts) {
  const matches = receipts.filter(
    (receipt) =>
      receipt.contractAddress?.toLowerCase() === creation.contractAddress?.toLowerCase() &&
      Number(receipt.status) === 1
  );
  if (matches.length !== 1 || !matches[0].transactionHash)
    throw new Error(`Expected one successful creation receipt for ${creation.contractName}.`);
  return matches[0];
}
