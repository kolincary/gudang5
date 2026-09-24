/**
 * Auto-fix transfer dates background scheduler has been permanently removed/deactivated.
 * Transfer dates are always strictly preserved based on actual scan/transaction timestamp.
 */
export const runAutoFixTransferDates = async (_silent = true): Promise<number> => {
  return 0;
};

export const startAutoFixTransferScheduler = () => {
  return () => {};
};

