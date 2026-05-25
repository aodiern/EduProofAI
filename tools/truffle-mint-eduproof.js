const fs = require("fs");

const EduProofCertificate = artifacts.require("EduProofCertificate");

module.exports = async function (callback) {
  try {
    const payloadPath = process.env.EDUPROOF_MINT_PAYLOAD;
    if (!payloadPath) {
      throw new Error("EDUPROOF_MINT_PAYLOAD is not set.");
    }

    const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
    const accounts = await web3.eth.getAccounts();
    const issuer = process.env.EDUPROOF_ISSUER || accounts[0];
    const studentWallet = process.env.EDUPROOF_STUDENT_WALLET || accounts[1] || accounts[0];
    const contract = await EduProofCertificate.deployed();
    const scoreBps = Math.max(0, Math.min(10000, Math.round(Number(payload.score || 0) * 100)));
    const studentHash = web3.utils.soliditySha3(payload.author || studentWallet);

    const tx = await contract.mintCertificate(
      studentWallet,
      studentHash,
      payload.workHash,
      payload.reportHash,
      payload.title || "EduProof Certificate",
      payload.metadataURI,
      scoreBps,
      { from: issuer },
    );

    const event = tx.logs.find((log) => log.event === "CertificateMinted");
    const tokenId = event?.args?.tokenId?.toString();
    const networkId = await web3.eth.net.getId();

    console.log(
      "EDUPROOF_MINT_RESULT " +
        JSON.stringify({
          tokenId,
          transactionHash: tx.tx,
          blockNumber: tx.receipt.blockNumber,
          contractAddress: contract.address,
          networkId,
          issuer,
          studentWallet,
        }),
    );

    callback();
  } catch (error) {
    callback(error);
  }
};
