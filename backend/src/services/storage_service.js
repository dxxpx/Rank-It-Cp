// src/azureStorage.js
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT;
const ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING; // optional
const DEFAULT_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "tfstate";

if (!ACCOUNT_NAME && !CONNECTION_STRING) {
  console.warn(
    "Warning: Azure storage account name/connection string not set. Upload endpoints will fail until configured."
  );
}

/** return a BlobServiceClient using connection string or account/key */
function getBlobServiceClient() {
  if (CONNECTION_STRING) {
    return BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  }
  if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
    throw new Error(
      "Missing Azure storage credentials. Set AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY or AZURE_STORAGE_CONNECTION_STRING."
    );
  }
  const credential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  const url = `https://${ACCOUNT_NAME}.blob.core.windows.net`;
  return new BlobServiceClient(url, credential);
}

/**
 * Upload a buffer to a blob and return the blob URL (no SAS)
 * @param {Buffer} buffer
 * @param {string} blobName
 * @param {string} containerName
 * @param {string} contentType
 */
async function uploadBufferToBlob(
  buffer,
  blobName,
  containerName = DEFAULT_CONTAINER,
  contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
) {
  const serviceClient = getBlobServiceClient();
  const containerClient = serviceClient.getContainerClient(containerName);

  // Ensure container exists. Do NOT pass access:'private' — default is private (no public access).
  await containerClient.createIfNotExists();

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlobClient.url; // https://<acct>.blob.core.windows.net/<container>/<blob>
}

/**
 * Generate a read-only SAS URL for the given blob that expires in `expiresInSeconds`.
 * Requires AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY.
 *
 * @param {string} containerName
 * @param {string} blobName
 * @param {number} expiresInSeconds
 * @returns {Object} { sasUrl, expiresOn }
 */
function generateBlobSasUrl(containerName, blobName, expiresInSeconds = 3600) {
  if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
    throw new Error(
      "Cannot generate SAS without AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCOUNT_KEY"
    );
  }
  const credential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);

  const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    },
    credential
  ).toString();

  const baseUrl = `https://${ACCOUNT_NAME}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}`;
  return { sasUrl: `${baseUrl}?${sasToken}`, expiresOn };
}

module.exports = { uploadBufferToBlob, generateBlobSasUrl, DEFAULT_CONTAINER };
