// backend/scripts/testBlockchain.js
import { LocalBlockchainService } from '../dist/services/localBlockchain.service.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
  console.log('🚀 Starting blockchain test...');
  
  const blockchain = new LocalBlockchainService();
  
  try {
    // Read ABI from the contract artifact
    const artifactPath = join(__dirname, '../../blockchain/artifacts/contracts/LocalSimulation.sol/LocalSimulation.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    
    // Initialize contract
    console.log('📝 Initializing contract...');
    const initialized = await blockchain.initializeContract(artifact.abi);
    
    if (!initialized) {
      console.error('❌ Failed to initialize contract. Make sure contract is deployed.');
      return;
    }
    
    // Store simulation result
    console.log('\n📝 Storing simulation result...');
    const result = await blockchain.storeSimulationResult({
      sessionId: 'test-session-001',
      candidateAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      overallScore: 95,
      technicalScore: 92,
      punctualityScore: 88,
      adaptabilityScore: 90,
      githubScore: 85
    });
    
    console.log('✅ Transaction stored!');
    console.log(`   Transaction hash: ${result.txHash}`);
    console.log(`   Block number: ${result.blockNumber}`);
    
    // Get simulation
    console.log('\n📝 Retrieving simulation...');
    const simulation = await blockchain.getSimulationResult('test-session-001');
    console.log('✅ Retrieved simulation:', simulation);
    
    // Verify simulation
    console.log('\n📝 Verifying simulation...');
    const verifyTx = await blockchain.verifySimulationResult('test-session-001');
    console.log(`✅ Simulation verified! Transaction: ${verifyTx}`);
    
    // Get updated simulation
    console.log('\n📝 Retrieving verified simulation...');
    const verifiedSim = await blockchain.getSimulationResult('test-session-001');
    console.log('✅ Verified simulation:', verifiedSim);
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

test();