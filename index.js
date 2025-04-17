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

// === 1. Generate Auth URL ===
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // Force new permissions
});

console.log("🔗 Open this URL in your browser:\n", authUrl);

// === 2. Ask for Auth Code ===
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\nPaste the code here: ", (code) => {
  rl.close();
  oAuth2Client.getToken(code, async (err, token) => {
    if (err) return console.error("❌ Error retrieving access token", err);
    oAuth2Client.setCredentials(token);
    fs.writeFileSync("token.json", JSON.stringify(token));
    console.log("✅ Token saved\n");

    // === 3. Transfer File Ownership ===
    const drive = google.drive({ version: "v3", auth: oAuth2Client });

    const FILE_ID = "1rmhR8xBeMvp9-oUB63Nx48TYdZWfwFOX"; // 📝 Change this
    const NEW_OWNER_EMAIL = "noaligpitan2@gmail.com"; // 📝 Change this

    try {
      // Step 1: Share as writer
      const res = await drive.permissions.create({
        fileId: FILE_ID,
        requestBody: {
          type: "user",
          role: "writer",
          emailAddress: NEW_OWNER_EMAIL,
        },
        fields: "id",
      });

      const permissionId = res.data.id;
      console.log(
        `✅ Shared with ${NEW_OWNER_EMAIL}, permission ID: ${permissionId}`
      );

      // Step 2: Promote to owner
      await drive.permissions.update({
        fileId: FILE_ID,
        permissionId,
        transferOwnership: true,
        requestBody: {
          role: "owner",
        },
      });

      console.log(`✅ Ownership transferred to ${NEW_OWNER_EMAIL}`);
    } catch (error) {
      console.error(
        "❌ Failed to transfer ownership:",
        error.errors || error.message
      );
    }
  });
});
