Write-Host "🚀 Installing blockchain dependencies..." -ForegroundColor Green

# Blockchain folder
Write-Host "📦 Installing Hardhat dependencies..." -ForegroundColor Yellow
Set-Location blockchain
npm init -y
npm install --save-dev hardhat
npm install --save-dev @nomiclabs/hardhat-waffle @nomiclabs/hardhat-ethers ethers@5.7.2
npm install --save-dev ethereum-waffle chai
npm install --save-dev dotenv

Write-Host "✅ Blockchain dependencies installed" -ForegroundColor Green

# Backend folder
Write-Host "📦 Installing backend blockchain dependencies..." -ForegroundColor Yellow
Set-Location ../backend
npm install ethers@5.7.2
npm install @ethersproject/providers @ethersproject/wallet @ethersproject/contracts
npm install dotenv

Write-Host "✅ Backend blockchain dependencies installed" -ForegroundColor Green

# Frontend folder (optional)
if (Test-Path "../frontend") {
    Write-Host "📦 Installing frontend blockchain dependencies..." -ForegroundColor Yellow
    Set-Location ../frontend
    npm install ethers@5.7.2
    npm install web3modal @walletconnect/web3-provider @coinbase/wallet-sdk
    Write-Host "✅ Frontend blockchain dependencies installed" -ForegroundColor Green
}

Write-Host "🎉 All blockchain dependencies installed!" -ForegroundColor Green

Step 1: Start Hardhat node (in one terminal)
bash
cd blockchain
npx hardhat node
You should see output like:

text
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
Accounts
========
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
...
Keep this terminal running.

Step 2: Deploy the contract (in another terminal)
Open a new terminal and run:

bash
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
You should see:

text
🚀 Deploying LocalSimulation contract...
Network: localhost
✅ LocalSimulation deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
📁 Address saved to contract.address
👤 Deployer address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
💰 Deployer balance: 9999.99 ETH
Step 3: Run the interaction test (in another terminal)
Open a third terminal and run:

bash
cd blockchain
npx hardhat run scripts/interact.js --network localhost
You should see:

text
🔍 Interacting with contract...
📄 Contract address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
👤 Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
👤 Candidate: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

📝 Storing simulation result...
✅ Stored result for session: test-session-001
   Transaction: 0x...

🔍 Retrieving simulation result...
   Candidate: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   Overall Score: 95
   Timestamp: [current time]
   Verified: false

✅ Verifying simulation result...
   Verified! Transaction: 0x...

   Verified status: true

🎉 All tests passed!
Alternative: Run with tsx if you prefer TypeScript
If you want to run your TypeScript test:

bash
cd backend
npx tsx scripts/testBlockchain.ts
If you get errors:
Error: "Cannot find module"
Make sure you're in the correct directory:

bash
pwd  # Should show .../blockchain
Error: "Could not find artifact"
Make sure the contract is compiled:

bash
cd blockchain
npx hardhat compile
Error: "Connection refused"
Make sure Hardhat node is running on port 8545:

bash
# Check if port is listening
netstat -an | findstr :8545
Error: "Nonce too high"
Reset the nonce or restart Hardhat node:

bash
# Stop Hardhat node (Ctrl+C)
# Delete the chain data
rm -rf ./cache
# Restart
npx hardhat node
Quick test script for backend (if you want to test the API)
Create backend/scripts/test-blockchain-api.js:

javascript
import { LocalBlockchainService } from '../src/services/localBlockchain.service.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
  console.log('🚀 Testing blockchain integration...');
  
  const blockchain = new LocalBlockchainService();
  
  try {
    // Read ABI
    const artifactPath = join(__dirname, '../../blockchain/artifacts/contracts/LocalSimulation.sol/LocalSimulation.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    
    // Initialize
    const initialized = await blockchain.initializeContract(artifact.abi);
    if (!initialized) {
      console.error('❌ Contract not initialized');
      return;
    }
    
    // Test store
    const result = await blockchain.storeSimulationResult({
      sessionId: `test-${Date.now()}`,
      candidateAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      overallScore: 85,
      technicalScore: 80,
      punctualityScore: 90,
      adaptabilityScore: 75,
      githubScore: 70
    });
    
    console.log('✅ Success!');
    console.log('   TX Hash:', result.txHash);
    console.log('   Block:', result.blockNumber);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
Run it:

bash
cd backend
npx tsx scripts/test-blockchain-api.js