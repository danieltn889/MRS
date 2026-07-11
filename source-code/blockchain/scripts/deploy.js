// scripts/deploy.js
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

// Path to local-keys.json
const LOCAL_KEYS_PATH = path.join(__dirname, '../blockchain/local-keys.json');

// Default private keys as fallback (if local-keys.json not found)
const FALLBACK_PRIVATE_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
];

// Function to load private keys from local-keys.json
function loadPrivateKeysFromFile() {
  try {
    if (fs.existsSync(LOCAL_KEYS_PATH)) {
      console.log(` Loading private keys from: ${LOCAL_KEYS_PATH}`);
      const keysData = JSON.parse(fs.readFileSync(LOCAL_KEYS_PATH, 'utf8'));
      
      if (keysData.accounts && Array.isArray(keysData.accounts)) {
        console.log(`''Loaded ${keysData.accounts.length} accounts from local-keys.json`);
        
        // Create a map of address -> privateKey
        const keyMap = new Map();
        for (const account of keysData.accounts) {
          if (account.address && account.privateKey) {
            keyMap.set(account.address.toLowerCase(), account.privateKey);
          }
        }
        
        return { keys: keysData.accounts, keyMap, source: 'local-keys.json'};
      }
    }
  } catch (error) {
    console.warn(` Could not load local-keys.json: ${error.message}`);
  }
  
  console.log(" Using fallback private keys");
  const fallbackAccounts = FALLBACK_PRIVATE_KEYS.map((key, index) => ({
    index,
    address: "unknown",
    privateKey: key
  }));
  
  return { keys: fallbackAccounts, keyMap: new Map(), source: 'fallback'};
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" Deploying LocalSimulation contract...");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`📡 Network: ${hre.network.name}`);
  
  // Load private keys from local-keys.json
  const { keys: loadedKeys, keyMap, source } = loadPrivateKeysFromFile();
  
  // Get all signers from Hardhat
  const signers = await hre.ethers.getSigners();
  console.log(`📋 Found ${signers.length} signer accounts`);
  console.log(`🔑 Private keys source: ${source}`);
  
  // Check if this is a local network
  const isLocalNetwork = hre.network.name === 'hardhat'|| 
                         hre.network.name === 'localhost'|| 
                         hre.network.name === 'ganache';
  
  // Create blockchain directory if it doesn't exist
  const blockchainDir = path.join(__dirname, '../blockchain');
  if (!fs.existsSync(blockchainDir)) {
    fs.mkdirSync(blockchainDir, { recursive: true });
    console.log(` Created blockchain directory: ${blockchainDir}`);
  }
  
  // Display account information
  console.log("\n📊 ACCOUNTS:");
  for (let i = 0; i < Math.min(signers.length, 10); i++) {
    const signer = signers[i];
    const balance = await signer.getBalance();
    const balanceEth = hre.ethers.utils.formatEther(balance);
    
    // Try to find private key for this address
    let privateKey = null;
    if (keyMap.has(signer.address.toLowerCase())) {
      privateKey = keyMap.get(signer.address.toLowerCase());
    } else if (isLocalNetwork && loadedKeys[i]) {
      privateKey = loadedKeys[i].privateKey;
    }
    
    console.log(`   Account ${i}: ${signer.address}`);
    console.log(`      Balance: ${balanceEth} ETH`);
    if (privateKey && isLocalNetwork) {
      const maskedKey = privateKey.substring(0, 20) + '...';
      console.log(`      Private Key: ${maskedKey}`);
    }
  }
  
  if (signers.length > 10) {
    console.log(`   ... and ${signers.length - 10} more accounts`);
  }
  
  // Get the contract factory
  console.log("\n Compiling and deploying contract...");
  const LocalSimulation = await hre.ethers.getContractFactory("LocalSimulation");
  
  // Deploy the contract
  const deploymentStart = Date.now();
  const simulation = await LocalSimulation.deploy();
  
  // Wait for deployment
  await simulation.deployed();
  const deploymentEnd = Date.now();
  
  console.log(`\n''LocalSimulation deployed successfully!`);
  console.log(`   📍 Contract Address: ${simulation.address}`);
  console.log(`   ⏱️  Deployment time: ${deploymentEnd - deploymentStart}ms`);
  console.log(`   🔗 Transaction: ${simulation.deployTransaction.hash}`);
  
  // Get deployment transaction details
  const receipt = await simulation.deployTransaction.wait();
  console.log(`   📦 Block Number: ${receipt.blockNumber}`);
  console.log(`   ⛽ Gas Used: ${receipt.gasUsed.toString()}`);
  
  // Build accounts array with private keys from loaded keys
  const accounts = [];
  for (let i = 0; i < Math.min(signers.length, 20); i++) {
    const signer = signers[i];
    const balance = await signer.getBalance();
    
    // Get private key from loaded keys
    let privateKey = null;
    if (keyMap.has(signer.address.toLowerCase())) {
      privateKey = keyMap.get(signer.address.toLowerCase());
    } else if (loadedKeys[i]) {
      privateKey = loadedKeys[i].privateKey;
    }
    
    accounts.push({
      index: i,
      address: signer.address,
      privateKey: isLocalNetwork ? (privateKey || "NOT_FOUND") : "NOT_SAVED_FOR_SECURITY",
      balance: hre.ethers.utils.formatEther(balance),
    });
  }
  
  // ============================================
  // UPDATE local-keys.json with correct balances and addresses
  // ============================================
  if (isLocalNetwork) {
    const updatedKeysData = {
      network: hre.network.name,
      chainId: hre.network.config.chainId || (await hre.ethers.provider.getNetwork()).chainId,
      generatedAt: new Date().toISOString(),
      warning: " THESE ARE DEFAULT HARDHAT PRIVATE KEYS - FOR LOCAL DEVELOPMENT ONLY ",
      neverUseOnMainnet: "Never use these keys on Mainnet or any live network!",
      accounts: accounts.map(acc => ({
        index: acc.index,
        address: acc.address,
        privateKey: acc.privateKey,
        balance: acc.balance
      }))
    };
    
    // Save/update local-keys.json
    fs.writeFileSync(LOCAL_KEYS_PATH, JSON.stringify(updatedKeysData, null, 2));
    console.log(`\n📁 Updated local-keys.json with ${accounts.length} accounts`);
  }
  
  // ============================================
  // SAVE DEPLOYMENT INFO
  // ============================================
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId || (await hre.ethers.provider.getNetwork()).chainId,
    contractAddress: simulation.address,
    deployerAddress: signers[0].address,
    deployerBalance: hre.ethers.utils.formatEther(await signers[0].getBalance()),
    timestamp: new Date().toISOString(),
    transactionHash: simulation.deployTransaction.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    accounts: accounts.map(acc => ({
      index: acc.index,
      address: acc.address,
      balance: acc.balance
    }))
  };
  
  const deploymentPath = path.join(blockchainDir, `deployment-${hre.network.name}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(` Deployment info saved to: ${deploymentPath}`);
  
  // ============================================
  // SAVE JUST THE CONTRACT ADDRESS
  // ============================================
  const addressPath = path.join(blockchainDir, 'contract.address');
  fs.writeFileSync(addressPath, simulation.address);
  console.log(` Contract address saved to: ${addressPath}`);
  
  // ============================================
  // SAVE ABI
  // ============================================
  const artifactsDir = path.join(blockchainDir, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  const artifact = await hre.artifacts.readArtifact("LocalSimulation");
  const abiPath = path.join(artifactsDir, 'LocalSimulationABI.json');
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
  console.log(` ABI saved to: ${abiPath}`);
  
  // ============================================
  // SAVE A SIMPLE ADDRESS FILE FOR NODE.JS BACKEND
  // ============================================
  const simpleDeployPath = path.join(blockchainDir, 'deployment.json');
  const simpleDeploy = {
    contractAddress: simulation.address,
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync(simpleDeployPath, JSON.stringify(simpleDeploy, null, 2));
  console.log(` Simple deployment info saved to: ${simpleDeployPath}`);
  
  // ============================================
  // VERIFICATION (for non-local networks)
  // ============================================
  if (!isLocalNetwork && process.env.ETHERSCAN_API_KEY) {
    console.log("\n🔍 Attempting to verify contract on explorer...");
    try {
      await hre.run("verify:verify", {
        address: simulation.address,
        constructorArguments: [],
      });
      console.log("''Contract verified successfully!");
    } catch (verifyError) {
      console.log(" Contract verification failed. You can verify manually later.");
      console.log(`   Run: npx hardhat verify --network ${hre.network.name} ${simulation.address}`);
    }
  }
  
  // ============================================
  // SUMMARY
  // ============================================
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("''DEPLOYMENT COMPLETED SUCCESSFULLY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\n📋 SUMMARY:");
  console.log(`   Contract Address: ${simulation.address}`);
  console.log(`   Network: ${hre.network.name}`);
  console.log(`   Chain ID: ${hre.network.config.chainId || 'N/A'}`);
  console.log(`   Deployer: ${signers[0].address}`);
  console.log(`   Transaction: ${simulation.deployTransaction.hash}`);
  console.log(`   Block: ${receipt.blockNumber}`);
  
  console.log("\n📁 FILES CREATED/UPDATED:");
  console.log(`   ${LOCAL_KEYS_PATH} - Updated with latest balances`);
  console.log(`   ${deploymentPath} - Full deployment info`);
  console.log(`   ${addressPath} - Just contract address`);
  console.log(`   ${abiPath} - Contract ABI`);
  console.log(`   ${simpleDeployPath} - Simple deployment info`);
  
  // Security reminder
  if (isLocalNetwork) {
    console.log("\n️  SECURITY REMINDER:");
    console.log("   - local-keys.json contains private keys for local development only");
    console.log("   - DO NOT commit this file to version control!");
    console.log("   - DO NOT use these keys on Mainnet or any live network!");
    console.log("   - Add 'blockchain/local-keys.json'to .gitignore");
  }
  
  console.log("\n🎉 Ready to use! Update your .env file with:");
  console.log(`   CONTRACT_ADDRESS=${simulation.address}`);
  console.log(`   BLOCKCHAIN_RPC_URL=http://localhost:8545`);
  console.log(`   USE_BLOCKCHAIN=true`);
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });