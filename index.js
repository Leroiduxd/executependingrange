import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const providerRead = new ethers.providers.JsonRpcProvider(process.env.RPC_READ);
const providerWrite = new ethers.providers.JsonRpcProvider(process.env.RPC_WRITE);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, providerWrite);
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

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

const waitForProof = async (index, retries = 100, delayMs = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch("https://proof-production.up.railway.app/get-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index })
    });

    const data = await res.json();
    if (data.proof_bytes) {
      return data.proof_bytes;
    }

    console.log(`🔄 No proof yet for index ${index}, retrying (${attempt}/${retries})...`);
    await new Promise(r => setTimeout(r, delayMs));
  }

  throw new Error("Proof not available after retries");
};

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

      const assetIndex = order.assetIndex.toNumber();
      const proof = await waitForProof(assetIndex);

      const tx = await writeContract.executePendingOrder(i, proof, { gasLimit: 800000 });
      await tx.wait();

      console.log(`✅ Executed order #${i} | Tx: ${tx.hash}`);
      results.push({ orderId: i, status: "executed", txHash: tx.hash });

    } catch (err) {
      results.push({ orderId: i, status: "error", reason: err.reason || err.message });
    }
  }

  res.json({ total: results.length, results });
});

app.listen(port, () => {
  console.log(`🟢 API listening at http://localhost:${port}`);
});

