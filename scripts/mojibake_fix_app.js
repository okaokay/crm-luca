const fs = require("fs");

const filePath = "packages/frontend/src/App.tsx";
let text = fs.readFileSync(filePath, "utf8");

const replacements = [
  ["Ã¢â‚¬Â¦", "..."],
  ["Ã¢â‚¬â€", "—"],
  ["Ã¢â‚¬â€œ", "–"],
  ["Ã¢â€ â€™", "->"],
  ["Ã¢â€ Â", "<-"],
  ["Ã‚Â·", "·"],
  ["Ã‚Â²", "²"],
  ["mÃ‚Â²", "m²"],
  ["Ã¢â€šÂ¬", "€"],
  ["Ã‚Â°", "°"],
  ["CittÃƒÂ ", "Città"],
  ["cittÃƒÂ ", "città"],
  ["LocalitÃƒÂ ", "Località"],
  ["localitÃƒÂ ", "località"],
  ["identitÃƒÂ ", "identità"],
  ["compatibilitÃƒÂ ", "compatibilità"],
  ["OperativitÃƒÂ ", "Operatività"],
  ["operativitÃƒÂ ", "operatività"],
  ["AttivitÃƒÂ ", "Attività"],
  ["attivitÃƒÂ ", "attività"],
  ["DisponibilitÃƒÂ ", "Disponibilità"],
  ["disponibilitÃƒÂ ", "disponibilità"],
  ["entitÃƒÂ ", "entità"],
  ["piÃƒÂ¹", "più"],
  ["sarÃƒÂ ", "sarà"],
  ["ÃƒÂ¨", "è"],
  ["puÃƒÂ²", "può"],
  ["SÃƒÂ¬", "Sì"],
  ["giÃƒÂ ", "già"],
  ["FranÃƒÂ§ais", "Français"],
  ["Ã¢ÂÂ°", "⏰"],
  ["Ã¢Å“â€¦", "✅"],
  ["Ã¢ÂÅ’", "❌"],
  ["Ã¢Å“â€œ", "✓"],
  ["Ã¢Å“â€Ã¯Â¸Â", "✔️"],
  ["Ã¢Å¡â„¢Ã¯Â¸Â", "⚙️"],
  ["Ã¢Â¬â€¡Ã¯Â¸Â", "⬇️"],
  ["Ã¢Å“Â¨", "✨"],
  ["Ã¢â€“Â¶Ã¯Â¸Â", "▶️"],
  ["Ã¢ÂÂ¹Ã¯Â¸Â", "⏹️"],
  ["Ã¢Ëœâ‚¬Ã¯Â¸Â", "☀️"],
  ["Ã¢Â­Â", "⭐"],
  ["Ã¢â€žÂ¹Ã¯Â¸Â", "ℹ️"],
  ["Ã¯Â¸Â", ""],
  ["Ã‚", ""],
  ["ï¿½", "€"],
];

for (const [from, to] of replacements) {
  text = text.split(from).join(to);
}

fs.writeFileSync(filePath, text, "utf8");
console.log("mojibake fix applied:", filePath);

