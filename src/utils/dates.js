/** "Sunday, 29 November 2026": how event dates read in WhatsApp messages. Event dates are stored as UTC midnight. */
const dateLabel = date =>
  new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

module.exports = { dateLabel };
