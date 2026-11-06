// Independent, exponential oracle for small test cases only (at most 10 nonzero balances).
// A zero-sum group of k participants needs at least k - 1 transfers. Maximize the
// number of disjoint zero-sum groups to obtain the exact global minimum.
function exactMinimumTransfers(balances) {
  const values = balances.filter(value => value !== 0);
  if (values.length > 10) throw new Error('Oracle is limited to 10 nonzero balances.');
  if (values.reduce((sum, value) => sum + value, 0) !== 0) {
    throw new Error('Oracle requires balanced input.');
  }
  const sums = new Array(1 << values.length).fill(0);
  for (let mask = 1; mask < sums.length; mask++) {
    const bit = mask & -mask;
    sums[mask] = sums[mask ^ bit] + values[Math.log2(bit)];
  }
  const memo = new Map([[0, 0]]);
  function maxGroups(mask) {
    if (memo.has(mask)) return memo.get(mask);
    let best = -Infinity;
    const first = mask & -mask;
    for (let subset = mask; subset; subset = (subset - 1) & mask) {
      if ((subset & first) && sums[subset] === 0) {
        best = Math.max(best, 1 + maxGroups(mask ^ subset));
      }
    }
    memo.set(mask, best);
    return best;
  }
  return values.length - maxGroups(sums.length - 1);
}

module.exports = { exactMinimumTransfers };
