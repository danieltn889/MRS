const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployerAddress: deployer.address,
    deployerBalance: hre.ethers.utils.formatEther(await deployer.getBalance()),
    timestamp: new Date().toISOString(),
    accounts: []
  };
  
  // Get all accounts (for local development)
  if (hre.network.name === 'hardhat'|| hre.network.name === 'localhost') {
    const signers = await hre.ethers.getSigners();
    for (let i = 0; i < Math.min(signers.length, 5); i++) {
      const balance = await signers[i].getBalance();
      deploymentInfo.accounts.push({
        index: i,
        address: signers[i].address,
        balance: hre.ethers.utils.formatEther(balance)
      });
    }
  }
  
  // Save to file
  const filename = `deployment-${hre.network.name}-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`''Deployment info saved to ${filename}`);
  
  // Also save to a persistent location
  const persistentFile = path.join(__dirname, '../deployment-latest.json');
  fs.writeFileSync(persistentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`''Latest deployment saved to ${persistentFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });