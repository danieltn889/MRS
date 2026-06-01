// scripts/deploy.js
const hre = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("🚀 Deploying LocalSimulation contract...");
  console.log("Network:", hre.network.name);
  
  // Get the contract factory
  const LocalSimulation = await hre.ethers.getContractFactory("LocalSimulation");
  
  // Deploy the contract
  const simulation = await LocalSimulation.deploy();
  
  // Wait for deployment
  await simulation.deployed();
  
  console.log(`✅ LocalSimulation deployed to: ${simulation.address}`);
  
  // Save the contract address
  fs.writeFileSync('./contract.address', simulation.address);
  console.log(`📁 Address saved to contract.address`);
  
  // Get the deployer address (first Ganache account)
  const [deployer] = await hre.ethers.getSigners();
  console.log(`👤 Deployer address: ${deployer.address}`);
  
  // Get balance
  const balance = await deployer.getBalance();
  console.log(`💰 Deployer balance: ${hre.ethers.utils.formatEther(balance)} ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });