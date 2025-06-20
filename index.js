import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// 📡 RPC lecture et écriture
const providerRead = new ethers.providers.JsonRpcProvider(process.env.RPC_READ);
const providerWrite = new ethers.providers.JsonRpcProvider(process.env.RPC_WRITE);

// 🔐 Wallet d'exécution
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, providerWrite);

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const PROOF_API = process.env.PROOF_API_URL || "https://multiproof-production.up.railway.app/proof";

const ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "orderId", "type": "uint256" },
      { "internalType": "bytes", "name": "proof", "type": "bytes" }
    ],
    "name": "executePendingOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "pendingOrders",
    "outputs": [
      { "internalType": "address", "name": "user", "type": "address" },
      { "internalType": "uint256", "name": "assetIndex", "type": "uint256" },
      { "internalType": "uint256", "name": "usdSize", "type": "uint256" },
      { "internalType": "uint256", "name": "leverage", "type": "uint256" },
      { "internalType": "bool", "name": "isLong", "type": "bool" },
      { "internalType": "uint256", "name": "slPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "tpPrice", "type": "uint256" },
      { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, providerRead);
const writeContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

app.get("/execute-range", async (req, res) => {
  const start = parseInt(req.query.start);
  const end = parseInt(req.query.end);

  if (isNaN(start) || isNaN(end) || start > end) {
    return res.status(400).json({ error: "Invalid 'start' and 'end' params" });
  }

  const results = [];

  for (let i = start; i <= end; i++) {
    try {
      const order = await readContract.pendingOrders(i);

      if (order.user === "0x0000000000000000000000000000000000000000") {
        results.push({ orderId: i, status: "skipped", reason: "deleted" });
        continue;
      }

      const proofRes = await fetch(PROOF_API);
      const proofData = await proofRes.json();
      const proof = proofData.proof;

      if (!proof) {
        results.push({ orderId: i, status: "failed", reason: "no proof returned" });
        continue;
      }

      const tx = await writeContract.executePendingOrder(i, proof, { gasLimit: 800000 });
      await tx.wait();

      console.log(`✅ Executed order #${i} | Tx: ${tx.hash}`);
      results.push({ orderId: i, status: "executed", txHash: tx.hash });
    } catch (err) {
      console.error(`❌ Error executing order #${i}:`, err.reason || err.message);
      results.push({ orderId: i, status: "error", reason: err.reason || err.message });
    }
  }

  res.json({ total: results.length, results });
});

app.listen(port, () => {
  console.log(`🟢 API listening at http://localhost:${port}`);
});
