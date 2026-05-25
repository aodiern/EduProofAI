const EduProofCertificate = artifacts.require("EduProofCertificate");

module.exports = async function (deployer) {
  const maxSupply = 10000;
  await deployer.deploy(EduProofCertificate, maxSupply);
};
