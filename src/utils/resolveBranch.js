const Branch = require('../models/Branch');

const NUMERIC_BRANCH_MAP = {
  '1': /ragheey/i,
  '2': /mishrif/i,
  '3': /andalus/i,
  '4': /ardiya/i,
  '5': /khaitan/i,
  '6': /qurain/i,
  '7': /jahra/i,
  '8': /rigai/i,
};

/**
 * Resolves a branch identifier (which can be a 24-char ObjectId, a numeric string "1"-"8", or a branch name)
 * into a real Mongoose Branch document.
 */
const resolveBranch = async (branchIdentifier) => {
  if (!branchIdentifier || branchIdentifier === 'All' || branchIdentifier === 'all') {
    return null;
  }
  const raw = String(branchIdentifier).trim();
  if (!raw || raw === 'null' || raw === 'undefined') {
    return null;
  }

  // 1. Valid 24-char Hex ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(raw)) {
    const byId = await Branch.findById(raw);
    if (byId) return byId;
  }

  // 2. Numeric fallback ID ("1" -> Ragheey, "2" -> Mishrif, etc.)
  if (NUMERIC_BRANCH_MAP[raw]) {
    const byNumeric = await Branch.findOne({ name: NUMERIC_BRANCH_MAP[raw] });
    if (byNumeric) return byNumeric;
  }

  // 3. Exact name match (case-insensitive)
  const byExactName = await Branch.findOne({ name: new RegExp(`^${raw}$`, 'i') });
  if (byExactName) return byExactName;

  // 4. Partial name match
  const byPartialName = await Branch.findOne({ name: new RegExp(raw, 'i') });
  if (byPartialName) return byPartialName;

  return null;
};

module.exports = resolveBranch;
