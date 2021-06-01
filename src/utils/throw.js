/**
 * @param {string} errorMsg
 */
function throwError(errorMsg) {
  throw new Error(errorMsg);
}

module.exports = {
  throwError,
};
