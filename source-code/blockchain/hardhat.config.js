// hardhat.config.js - local dev + free Sepolia testnet deploy
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
try { require('dotenv').config(); } catch (e) { /* dotenv optional — env vars can be passed inline */ }

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337,
      accounts: {
        count: 20,
        accountsBalance: "10000000000000000000000" // 10,000 ETH per account
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337
    },
    // Free Ethereum testnet. Default RPC is a free public endpoint (no signup);
    // override with your own (e.g. Alchemy) via ETHEREUM_SEPOLIA_RPC_URL.
    // Needs a funded wallet key in ETHEREUM_PRIVATE_KEY (free Sepolia ETH from a faucet).
    sepolia: {
      url: process.env.ETHEREUM_SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      chainId: 11155111,
      accounts: process.env.ETHEREUM_PRIVATE_KEY ? [process.env.ETHEREUM_PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
    cache: "./cache"
  }
};