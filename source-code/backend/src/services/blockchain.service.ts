// services/blockchain.service.ts
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from './database.service.js';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LocalAccount {
  index: number;
  address: string;
  privateKey: string;
}

interface StoreResultParams {
  sessionId: string;
  simulationId: string;
  candidateId: string;
  overallScore: number;
  technicalScore: number;
  punctualityScore: number;
  adaptabilityScore: number;
  githubScore: number;
}

interface BlockchainStoreResult {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  address: string;
  isNewAddress: boolean;
  balance: string;
}

export class BlockchainService {
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract | null = null;
  private contractAddress: string = '';
  private localKeys: LocalAccount[] = [];

  constructor() {
    const network = process.env.ETHEREUM_NETWORK || 'localhost';
    const rpcUrl = network === 'sepolia'
      ? (process.env.ETHEREUM_SEPOLIA_RPC_URL || process.env.BLOCKCHAIN_RPC_URL || 'https://ethereum-sepolia.publicnode.com')
      : (process.env.BLOCKCHAIN_RPC_URL || 'http://localhost:8545');
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    const privateKey = this.loadPrivateKey();
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    this.contractAddress = this.loadContractAddress();
    
    console.log(`🔗 Blockchain connected to: ${rpcUrl}`);
    console.log(`👤 Wallet Address: ${this.wallet.address}`);
    
    this.getBalance().then(balance => {
      console.log(`💰 Balance: ${balance} ETH`);
    }).catch((err: Error) => {
      console.warn(`⚠️ Could not fetch balance: ${err.message}`);
    });
    
    if (this.contractAddress) {
      console.log(`📄 Contract Address: ${this.contractAddress}`);
    } else {
      console.log(`⚠️ No contract address found. Please deploy the contract first.`);
    }
  }

  private cleanAddress(address: string): string {
    if (!address) return '';
    // Extract only the hex address (0x followed by 40 hex characters)
    const match = address.match(/0x[a-fA-F0-9]{40}/i);
    if (match) {
      return match[0];
    }
    // If no match, try to remove any non-hex characters
    const cleaned = address.replace(/[^0-9a-fA-Fx]/g, '');
    if (cleaned.startsWith('0x') && cleaned.length === 42) {
      return cleaned;
    }
    return address;
  }

  private loadPrivateKey(): string {
    // FIRST: check .env ETHEREUM_PRIVATE_KEY — this is the primary source for Sepolia
    const envKey = process.env.ETHEREUM_PRIVATE_KEY;
    if (envKey && envKey.trim().length > 10) {
      const key = envKey.trim().startsWith('0x') ? envKey.trim() : `0x${envKey.trim()}`;
      try {
        const w = new ethers.Wallet(key);
        console.log(`✅ [Blockchain] Using ETHEREUM_PRIVATE_KEY from .env → Wallet: ${w.address}`);
        return key;
      } catch {
        console.warn('⚠️ ETHEREUM_PRIVATE_KEY in .env is invalid, falling back to local-keys.json');
      }
    } else {
      console.warn('⚠️ ETHEREUM_PRIVATE_KEY not set in .env — falling back to local-keys.json (no Sepolia ETH)');
    }

    try {
      const possiblePaths = [
        path.join(__dirname, '../../../blockchain/local-keys.json'),
        path.join(__dirname, '../../blockchain/local-keys.json'),
        path.join(__dirname, '../blockchain/local-keys.json'),
        path.join(process.cwd(), 'blockchain/local-keys.json'),
        path.join(process.cwd(), 'local-keys.json')
      ];

      for (const keysPath of possiblePaths) {
        if (fs.existsSync(keysPath)) {
          console.log(`📁 Loading keys from: ${keysPath}`);
          const keysData = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
          this.localKeys = keysData.accounts || [];

          if (this.localKeys.length > 0) {
            console.log(`✅ Loaded ${this.localKeys.length} local accounts`);
            const account = this.localKeys[0];
            if (account && account.privateKey) {
              console.log(`✅ Using Account #${account.index}: ${account.address}`);
              return account.privateKey;
            }
          }
        }
      }

      console.warn('⚠️ local-keys.json not found, using default Hardhat Account #0 (no Sepolia ETH)');
      return '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to load private key:', err.message);
      return '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    }
  }

  private loadContractAddress(): string {
    // FIRST: ETHEREUM_CONTRACT_ADDRESS (Sepolia deployed contract)
    if (process.env.ETHEREUM_CONTRACT_ADDRESS) {
      const envAddress = this.cleanAddress(process.env.ETHEREUM_CONTRACT_ADDRESS);
      if (envAddress && envAddress.match(/^0x[a-fA-F0-9]{40}$/i)) {
        console.log(`✅ Using contract address from ETHEREUM_CONTRACT_ADDRESS: ${envAddress}`);
        return envAddress;
      }
    }
    // SECOND: CONTRACT_ADDRESS fallback
    if (process.env.CONTRACT_ADDRESS) {
      const envAddress = this.cleanAddress(process.env.CONTRACT_ADDRESS);
      if (envAddress && envAddress.match(/^0x[a-fA-F0-9]{40}$/i)) {
        console.log(`✅ Using contract address from CONTRACT_ADDRESS: ${envAddress}`);
        return envAddress;
      }
    }
    
    try {
      const possiblePaths = [
        path.join(__dirname, '../../../blockchain/deployment-localhost.json'),
        path.join(__dirname, '../../blockchain/deployment-localhost.json'),
        path.join(__dirname, '../blockchain/deployment-localhost.json'),
        path.join(process.cwd(), 'blockchain/deployment-localhost.json'),
        path.join(process.cwd(), 'contract.address')
      ];
      
      for (const deploymentPath of possiblePaths) {
        if (fs.existsSync(deploymentPath)) {
          console.log(`📁 Loading deployment from: ${deploymentPath}`);
          const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
          
          if (deploymentData.contractAddress) {
            const cleaned = this.cleanAddress(deploymentData.contractAddress);
            if (cleaned) {
              console.log(`✅ Found contract address: ${cleaned}`);
              return cleaned;
            }
          } else if (deploymentData.address) {
            const cleaned = this.cleanAddress(deploymentData.address);
            if (cleaned) {
              console.log(`✅ Found contract address: ${cleaned}`);
              return cleaned;
            }
          } else if (typeof deploymentData === 'string') {
            const cleaned = this.cleanAddress(deploymentData);
            if (cleaned) {
              console.log(`✅ Found contract address: ${cleaned}`);
              return cleaned;
            }
          }
        }
      }
      
      const addressPath = path.join(__dirname, '../../../blockchain/contract.address');
      if (fs.existsSync(addressPath)) {
        let address = fs.readFileSync(addressPath, 'utf8').trim();
        const cleaned = this.cleanAddress(address);
        if (cleaned) {
          console.log(`✅ Found contract address in contract.address: ${cleaned}`);
          return cleaned;
        }
      }
      
      console.warn('⚠️ No contract address found');
      return '';
      
    } catch (error) {
      const err = error as Error;
      console.warn('Failed to load contract address:', err.message);
      return '';
    }
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }

  getLocalAccounts(): LocalAccount[] {
    return this.localKeys;
  }

  getAccountByIndex(index: number): LocalAccount | undefined {
    return this.localKeys.find(acc => acc.index === index);
  }

  async switchToAccount(index: number): Promise<boolean> {
    const account = this.getAccountByIndex(index);
    if (!account) {
      console.error(`❌ Account ${index} not found`);
      return false;
    }
    
    this.wallet = new ethers.Wallet(account.privateKey, this.provider);
    if (this.contract) {
      this.contract = this.contract.connect(this.wallet);
    }
    
    console.log(`🔄 Switched to account ${index}: ${this.wallet.address}`);
    return true;
  }

  async initializeContract(abi: any): Promise<ethers.Contract | null> {
    if (!this.contractAddress) {
      console.error('❌ Contract address not set. Please deploy the contract first.');
      return null;
    }
    
    // Clean the address before using
    const cleanAddress = this.cleanAddress(this.contractAddress);
    
    this.contract = new ethers.Contract(cleanAddress, abi, this.wallet);
    console.log(`✅ Contract initialized at: ${cleanAddress}`);
    
    try {
      const code = await this.provider.getCode(cleanAddress);
      if (code === '0x') {
        console.warn('⚠️ Warning: No contract code found at address');
        console.log('   Make sure the contract is deployed and the address is correct');
        return null;
      } else {
        console.log('✅ Contract verified on blockchain');
      }
    } catch (error) {
      const err = error as Error;
      console.warn('⚠️ Could not verify contract:', err.message);
    }
    
    return this.contract;
  }

  /**
   * Store simulation result using UNIQUE address per candidate with 2 decimal places
   */
  async storeSimulationResultWithUniqueAddress(data: StoreResultParams): Promise<BlockchainStoreResult> {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call initializeContract() first.');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔐 Getting unique blockchain address for candidate...');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const { address, privateKey, isNew } = await this.getUniqueAddressForCandidate(
      data.candidateId,
      data.simulationId,
      data.sessionId
    );
    
    console.log(`📊 Using blockchain address: ${address}`);
    console.log(`📊 Address is ${isNew ? 'NEW' : 'EXISTING'} for this simulation`);
    
    // The PLATFORM wallet signs + pays gas for EVERY credential. The candidate's address
    // is still recorded on-chain as the credential owner — storeResult() takes `candidate`
    // as a parameter and does NOT require the candidate to be the sender. So each candidate
    // keeps a unique address WITHOUT funding it: only the one platform wallet needs test ETH,
    // which scales to any number of candidates on a real testnet (Sepolia).
    void privateKey; // candidate key no longer used to sign — kept only as the owner address
    const contract = this.contract.connect(this.wallet);
    
    // Format scores to 2 decimal places for blockchain storage
    const overallScore = Number(data.overallScore.toFixed(2));
    const technicalScore = Number(data.technicalScore.toFixed(2));
    const punctualityScore = Number(data.punctualityScore.toFixed(2));
    const adaptabilityScore = Number(data.adaptabilityScore.toFixed(2));
    const githubScore = Number(data.githubScore.toFixed(2));
    
    console.log('📝 Storing simulation result on blockchain...');
    console.log(`   Session: ${data.sessionId}`);
    console.log(`   Candidate: ${address}`);
    console.log(`   Scores (2 decimals): Overall=${overallScore}%, Tech=${technicalScore}%, Punctuality=${punctualityScore}%, Adapt=${adaptabilityScore}%, GitHub=${githubScore}%`);
    
    const tx = await contract.storeResult(
      data.sessionId,
      address,
      overallScore,
      technicalScore,
      punctualityScore,
      adaptabilityScore,
      githubScore,
      { gasLimit: 500000 }
    );
    
    console.log(`⏳ Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`✅ Stored on blockchain!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
    
    await this.markAddressAsUsed(address, 'used');
    
    const finalBalance = await this.getBalance(address);
    console.log(`💰 Final balance: ${finalBalance} ETH`);
    
    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      address: address,
      isNewAddress: isNew,
      balance: finalBalance
    };
  }

  private async getUniqueAddressForCandidate(
    userId: string, 
    simulationId: string,
    sessionId: string
  ): Promise<{ address: string; privateKey: string; isNew: boolean }> {
    
    console.log('🔍 Checking for existing address...');
    
    const existingForSimulation = await DatabaseService.query(`
      SELECT address, private_key, status 
      FROM wallet_addresses 
      WHERE user_id = $1 AND simulation_id = $2 AND status = 'active'
      LIMIT 1
    `, [userId, simulationId]);
    
    if (existingForSimulation.rows[0]) {
      console.log(`✅ Candidate already has address for simulation ${simulationId}`);
      return {
        address: existingForSimulation.rows[0].address,
        privateKey: existingForSimulation.rows[0].private_key,
        isNew: false
      };
    }
    
    console.log('🔄 No existing address found, generating new unique address...');
    
    const maxAttempts = 10;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      const wallet = ethers.Wallet.createRandom();
      const address = wallet.address;
      const privateKey = wallet.privateKey;
      
      console.log(`🔄 Attempt ${attempt + 1}: Checking address ${address.substring(0, 10)}...`);
      
      const existingAddress = await DatabaseService.query(`
        SELECT id, user_id, simulation_id 
        FROM wallet_addresses 
        WHERE address = $1 AND status = 'active'
      `, [address]);
      
      if (existingAddress.rows.length === 0) {
        await DatabaseService.query(`
          INSERT INTO wallet_addresses (
            user_id, simulation_id, session_id, address, private_key, 
            status, used_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
        `, [userId, simulationId, sessionId, address, privateKey]);
        
        console.log(`✅ Generated NEW unique address for candidate: ${address.substring(0, 10)}...`);
        
        return {
          address,
          privateKey,
          isNew: true
        };
      }
      
      console.log(`⚠️ Address ${address.substring(0, 10)}... already in use by another candidate, retrying...`);
      attempt++;
    }
    
    throw new Error('Could not generate unique blockchain address after multiple attempts');
  }

  async getCandidateAddresses(userId: string): Promise<any[]> {
    const result = await DatabaseService.query(`
      SELECT 
        wa.address, 
        wa.simulation_id, 
        wa.session_id,
        wa.status, 
        wa.used_at,
        wa.created_at,
        ROUND(s.overall_score::numeric, 2) as overall_score, 
        st.name as simulation_name,
        st.type as simulation_type,
        st.difficulty
      FROM wallet_addresses wa
      LEFT JOIN simulations s ON wa.simulation_id = s.id
      LEFT JOIN simulation_templates st ON s.template_id = st.id
      WHERE wa.user_id = $1
      ORDER BY wa.used_at DESC NULLS LAST, wa.created_at DESC
    `, [userId]);
    
    return result.rows;
  }

  async markAddressAsUsed(address: string, newStatus: 'used' | 'expired' | 'revoked'): Promise<void> {
    await DatabaseService.query(`
      UPDATE wallet_addresses 
      SET status = $1, updated_at = NOW()
      WHERE address = $2
    `, [newStatus, address]);
  }

  async getSimulationResult(sessionId: string) {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }
    
    console.log(`🔍 Fetching simulation result for session: ${sessionId}`);
    
    const result = await this.contract.getResult(sessionId);
    
    const hasResult = result.candidate !== '0x0000000000000000000000000000000000000000';
    
    if (!hasResult) {
      return null;
    }
    
    return {
      sessionId: sessionId,
      candidateAddress: result.candidate,
      overallScore: Number(Number(result.overallScore).toFixed(2)),
      technicalScore: Number(Number(result.technicalScore).toFixed(2)),
      punctualityScore: Number(Number(result.punctualityScore).toFixed(2)),
      adaptabilityScore: Number(Number(result.adaptabilityScore).toFixed(2)),
      githubScore: Number(Number(result.githubScore).toFixed(2)),
      timestamp: new Date(Number(result.timestamp) * 1000),
      verified: result.verified
    };
  }

  async verifySimulationResult(sessionId: string) {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }
    
    console.log(`🔐 Verifying simulation result for session: ${sessionId}`);
    
    const tx = await this.contract.verifyResult(sessionId, { gasLimit: 100000 });
    const receipt = await tx.wait();
    
    console.log(`✅ Verified! Tx: ${receipt.transactionHash}`);
    
    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber
    };
  }

  async isContractDeployed(): Promise<boolean> {
    if (!this.contractAddress) return false;
    
    try {
      const code = await this.provider.getCode(this.contractAddress);
      return code !== '0x';
    } catch (error) {
      const err = error as Error;
      console.warn('Error checking contract:', err.message);
      return false;
    }
  }

  async getBalance(address?: string): Promise<string> {
    const targetAddress = address || this.wallet.address;
    try {
      const balance = await this.provider.getBalance(targetAddress);
      return ethers.utils.formatEther(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      return '0';
    }
  }

  generateCredentialHash(data: {
    sessionId: string;
    candidateId: string;
    overallScore: number;
    technicalScore: number;
    punctualityScore: number;
    adaptabilityScore: number;
    githubScore: number;
    txHash: string;
  }): string {
    const overallScore = data.overallScore.toFixed(2);
    const technicalScore = data.technicalScore.toFixed(2);
    const punctualityScore = data.punctualityScore.toFixed(2);
    const adaptabilityScore = data.adaptabilityScore.toFixed(2);
    const githubScore = data.githubScore.toFixed(2);
    
    const credentialData = JSON.stringify({
      sessionId: data.sessionId,
      candidateId: data.candidateId,
      overallScore: overallScore,
      technicalScore: technicalScore,
      punctualityScore: punctualityScore,
      adaptabilityScore: adaptabilityScore,
      githubScore: githubScore,
      txHash: data.txHash,
      timestamp: new Date().toISOString()
    });
    
    return crypto.createHash('sha256').update(credentialData).digest('hex');
  }
}

export const blockchainService = new BlockchainService();