const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPaise = rupees => Math.round(Number(rupees) * 100);

module.exports = { escapeRegex, toPaise };
