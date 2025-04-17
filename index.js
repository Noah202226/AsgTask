const { google } = require("googleapis");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const credentials = require("./credentials.json");
const { client_secret, client_id, redirect_uris } = credentials.web;

const TOKEN_PATH = path.join(__dirname, "token.json");

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const SCOPES = ["https://www.googleapis.com/auth/drive"];

function getAccessToken(callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n🔗 Open this URL in your browser:\n", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("\n📥 Paste the code here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("❌ Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log("✅ Token saved\n");
      callback(oAuth2Client);
    });
  });
}

function authorize(callback) {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    callback(oAuth2Client);
  } else {
    getAccessToken(callback);
  }
}

function transferOwnership(auth) {
  const drive = google.drive({ version: "v3", auth });

  const FILE_ID = "1FE7zAxyvGCU8Ac5l9OiWia08MdfviiCR32AChAlXRwM";
  const NEW_OWNER_EMAIL = "noaligpitan26@gmail.com";

  drive.permissions.list(
    {
      fileId: FILE_ID,
      fields: "permissions(id,emailAddress,role)",
    },
    async (err, res) => {
      if (err) return console.error("❌ Error fetching permissions:", err);
      const permission = res.data.permissions.find(
        (perm) => perm.emailAddress === NEW_OWNER_EMAIL
      );

      let permissionId = permission?.id;

      if (!permission) {
        // First share the file as a writer
        const createRes = await drive.permissions.create({
          fileId: FILE_ID,
          requestBody: {
            type: "user",
            role: "writer",
            emailAddress: NEW_OWNER_EMAIL,
          },
          fields: "id",
        });

        permissionId = createRes.data.id;

        console.log(`✅ Shared as writer. Permission ID: ${permissionId}`);
        console.log(
          `⚠️ Ask ${NEW_OWNER_EMAIL} to accept the file in their Google Drive.`
        );
        return;
      }

      console.log(
        `✅ User already has writer access. Permission ID: ${permissionId}`
      );

      // Now try to initiate ownership transfer
      try {
        await drive.permissions.update({
          fileId: FILE_ID,
          permissionId,
          requestBody: {
            role: "owner", // ONLY role
          },
          transferOwnership: true, // TOP-LEVEL parameter
        });

        console.log(`✅ Ownership transfer initiated to ${NEW_OWNER_EMAIL}.`);
        console.log(
          `📌 The user must now accept the ownership to complete it.`
        );
      } catch (error) {
        console.error("❌ Transfer failed:", error.errors || error.message);
      }
    }
  );
}

authorize(transferOwnership);
