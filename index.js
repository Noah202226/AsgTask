const { google } = require("googleapis");
const readline = require("readline");
const fs = require("fs");

const credentials = require("./credentials.json");
const { client_secret, client_id, redirect_uris } = credentials.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // <-- force fresh permissions
});

console.log("🔗 Visit this URL:\n", authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("🔑 Enter the code from Google: ", (code) => {
  rl.close();
  oAuth2Client.getToken(code, (err, token) => {
    if (err) return console.error("❌ Error retrieving access token", err);
    oAuth2Client.setCredentials(token);
    fs.writeFileSync("token.json", JSON.stringify(token));
    console.log("✅ Token stored");
  });
});
