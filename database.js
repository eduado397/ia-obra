import fs from "fs";

const DB_FILE = "messages.json";

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

export function saveMessage(sender, content) {
  const data = JSON.parse(fs.readFileSync(DB_FILE));
  data.push({
    sender,
    content,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

export function getLastMessages(limit = 50) {
  const data = JSON.parse(fs.readFileSync(DB_FILE));
  return data.slice(-limit);
}
