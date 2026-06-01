// scripts/interact.js
const hre = require("hardhat");
const fs = require('fs');

async function main() {
  console.log("🔍 Interacting with contract...");
  
  // Read the contract address
  const contractAddress = fs.readFileSync('./contract.address', 'utf8').trim();
  console.log(`📄 Contract address: ${contractAddress}`);
  
  // Get the contract
  const LocalSimulation = await hre.ethers.getContractFactory("LocalSimulation");
  const simulation = LocalSimulation.attach(contractAddress);
  
  // Get signers (Ganache accounts)
  const [deployer, candidate] = await hre.ethers.getSigners();
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`👤 Candidate: ${candidate.address}`);
  
  // Store a simulation result
  console.log("\n📝 Storing simulation result...");
  const sessionId = "test-session-001";
  
  const tx = await simulation.storeResult(
    sessionId,
    candidate.address,
    95,   // overallScore
    92,   // technicalScore
    88,   // punctualityScore
    90,   // adaptabilityScore
    85    // githubScore
  );
  
  await tx.wait();
  console.log(`✅ Stored result for session: ${sessionId}`);
  console.log(`   Transaction: ${tx.hash}`);
  
  // Get the result
  console.log("\n🔍 Retrieving simulation result...");
  const result = await simulation.getResult(sessionId);
  console.log(`   Candidate: ${result.candidate}`);
  console.log(`   Overall Score: ${result.overallScore}`);
  console.log(`   Timestamp: ${new Date(result.timestamp * 1000).toLocaleString()}`);
  console.log(`   Verified: ${result.verified}`);
  
  // Verify the result
  console.log("\n✅ Verifying simulation result...");
  const verifyTx = await simulation.verifyResult(sessionId);
  await verifyTx.wait();
  console.log(`   Verified! Transaction: ${verifyTx.hash}`);
  
  // Get updated result
  const verifiedResult = await simulation.getResult(sessionId);
  console.log(`   Verified status: ${verifiedResult.verified}`);
  
  console.log("\n🎉 All tests passed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });