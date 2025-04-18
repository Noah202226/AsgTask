const { google } = require("googleapis");

const fs = require("fs").promises;
const path = require("path");

const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

// Getting input in terminal
const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Load your credentials from the downloaded JSON file
async function loadCredentials() {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH);
    return JSON.parse(content);
  } catch (err) {
    console.error("Error loading client secret file:", err);
    throw err; // Better to throw the error than exit the process
  }
}

// Check if we have a stored token
async function hasToken() {
  try {
    await fs.access(TOKEN_PATH);
    return true;
  } catch (err) {
    return false;
  }
}

// Load previously saved token from file if available
async function loadToken() {
  try {
    const token = await fs.readFile(TOKEN_PATH);
    return JSON.parse(token);
  } catch (err) {
    return null;
  }
}

// Authorize your application using OAuth 2.0
async function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we already have token.json if now get new one again
  const storedToken = await loadToken();
  if (storedToken) {
    oAuth2Client.setCredentials(storedToken);
    return oAuth2Client;
  } else {
    return getNewToken(oAuth2Client);
  }
}

// Get a new OAuth 2.0 token
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline", // Request refresh token
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.permissions",
      "https://www.googleapis.com/auth/drive",
    ],
    prompt: "consent",
  });
  console.log("Authorize this app by visiting this url:", authUrl);

  const code = await new Promise((resolve) => {
    readline.question("Enter the code from that page here: ", resolve);
  });

  // Close readline only after we're done with it
  try {
    const tokenResponse = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokenResponse.tokens);
    // Store the token for future use
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenResponse.tokens));
    console.log("Token stored to", TOKEN_PATH);
    return oAuth2Client;
  } catch (err) {
    console.error("Error retrieving access token", err);
    throw err; // Better to throw than exit process
  } finally {
    readline.close(); // Move readline.close() here
  }
}

async function initiateOwnershipTransfer(authClient, fileId, newOwnerEmail) {
  const drive = google.drive({ version: "v3", auth: authClient });
  console.log(
    `Attempting ownership transfer of file ${fileId} to ${newOwnerEmail}`
  );

  try {
    // Log current owners
    try {
      const file = await drive.files.get({
        fileId: fileId,
        fields: "owners,name",
      });
      console.log(`File: ${file.data.name}`);
      console.log("Current owners:", file.data.owners);
    } catch (ownerError) {
      console.warn("Error getting file owners:", ownerError.message);
    }

    // Check if the user already has a permission
    const getPermissionsResponse = await drive.permissions.list({
      fileId: fileId,
      fields: "permissions(id, emailAddress, role, pendingOwner)",
      supportsAllDrives: true,
    });

    console.log(
      "Retrieved permissions:",
      getPermissionsResponse.data.permissions
    );

    const newOwnerPermission = getPermissionsResponse.data.permissions.find(
      (perm) => perm.emailAddress === newOwnerEmail
    );

    if (newOwnerPermission) {
      console.log("Updating existing permission ID:", newOwnerPermission.id);

      // Check if the permission is already pendingOwner
      if (newOwnerPermission.pendingOwner === true) {
        console.log(
          `Permission for ${newOwnerEmail} is already pending owner.`
        );
        return { status: "already-pending", email: newOwnerEmail };
      }

      // First make sure they're a writer
      const updateResponse = await drive.permissions.update({
        fileId: fileId,
        permissionId: newOwnerPermission.id,
        requestBody: {
          role: "writer",
        },
        supportsAllDrives: true,
      });

      // Then set them as pendingOwner
      const pendingResponse = await drive.permissions.update({
        fileId: fileId,
        permissionId: newOwnerPermission.id,
        requestBody: {
          role: "writer",
          pendingOwner: true,
        },
        supportsAllDrives: true,
        // Don't use transferOwnership here - we're just making them pendingOwner
      });

      console.log(
        `Ownership transfer initiated for existing permission of ${newOwnerEmail} on file ID: ${fileId}`
      );
      return { status: "success", email: newOwnerEmail };
    } else {
      console.log("Creating new permission for:", newOwnerEmail);

      // First create with writer role
      const createResponse = await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: "writer",
          type: "user",
          emailAddress: newOwnerEmail,
        },
        supportsAllDrives: true,
        sendNotificationEmail: true,
      });

      // Then update to pendingOwner
      const pendingResponse = await drive.permissions.update({
        fileId: fileId,
        permissionId: createResponse.data.id,
        requestBody: {
          role: "writer",
          pendingOwner: true,
        },
        supportsAllDrives: true,
        // Don't use transferOwnership here - we're just making them pendingOwner
      });

      console.log(
        `Ownership transfer initiated for ${newOwnerEmail} on file ID: ${fileId}`
      );
      return { status: "success", email: newOwnerEmail };
    }
  } catch (error) {
    console.error("Error initiating ownership transfer:", error.message);
    if (error.errors) {
      console.error("API Error details:", error.errors);
    }
    throw error;
  }
}
// Main function to run the application
async function main() {
  try {
    // Move these to configuration or environment variables
    const fileId =
      process.env.FILE_ID || "1bgwF8h1GupkQ8RmEorNW5wRGKm2kbmDnziFfU93H8K4";
    const newOwnerEmail =
      process.env.NEW_OWNER_EMAIL || "noaligpitan@gmail.com";

    const credentials = await loadCredentials();
    const authClient = await authorize(credentials);

    const result = await initiateOwnershipTransfer(
      authClient,
      fileId,
      newOwnerEmail
    );
    console.log(`Operation completed: ${result.status} for ${result.email}`);
  } catch (error) {
    console.error("Application error:", error.message);
    process.exit(1);
  }
}

// Only run directly (not when imported)
if (require.main === module) {
  main();
}

// Export functions for testing or reuse
module.exports = {
  initiateOwnershipTransfer,
  authorize,
  loadCredentials,
};
