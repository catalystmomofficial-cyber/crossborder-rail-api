import { Router, Request, Response } from "express";
import axios from "axios";

const router = Router();

interface PayoutRequestBody {
  amount_usd: number;
  sender_id: string;
  recipient_bank_code: string;
  recipient_account_number: string;
}

interface BridgeTransferResult {
  bridge_transfer_id: string;
  usdc_amount: number;
  network: "solana";
  status: "completed";
}

interface OfframpPayoutResult {
  offramp_reference_id: string;
  payout_amount_usd: number;
  bank_code: string;
  account_number: string;
  status: "completed";
}

function isValidPayoutRequest(body: any): body is PayoutRequestBody {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof body.amount_usd === "number" &&
    Number.isFinite(body.amount_usd) &&
    body.amount_usd > 0 &&
    typeof body.sender_id === "string" &&
    body.sender_id.trim().length > 0 &&
    typeof body.recipient_bank_code === "string" &&
    body.recipient_bank_code.trim().length > 0 &&
    typeof body.recipient_account_number === "string" &&
    body.recipient_account_number.trim().length > 0
  );
}

/**
 * Simulates routing a USD transfer through Bridge's sandbox API as USDC on Solana.
 * 1:1 net routing — no markup is applied at this leg.
 */
async function routeThroughBridge(
  amountUsd: number,
  senderId: string
): Promise<BridgeTransferResult> {
  const bridgeBaseUrl = process.env.BRIDGE_API_BASE_URL;
  const bridgeApiKey = process.env.BRIDGE_API_KEY;

  // Mock call shape — replace with a real axios.post to Bridge's sandbox
  // transfer endpoint once credentials are wired in.
  await axios
    .post(
      `${bridgeBaseUrl}/v0/transfers`,
      {
        amount: amountUsd.toFixed(2),
        currency: "usd",
        on_behalf_of: senderId,
        source: { currency: "usd", payment_rail: "wire" },
        destination: { currency: "usdc", payment_rail: "solana" },
      },
      {
        headers: {
          "Api-Key": bridgeApiKey,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      }
    )
    .catch(() => {
      // Sandbox call intentionally swallowed for mock mode; real
      // integration should propagate this error to the caller.
    });

  return {
    bridge_transfer_id: `bridge_${Date.now()}`,
    usdc_amount: amountUsd, // 1:1, no markup
    network: "solana",
    status: "completed",
  };
}

/**
 * Simulates triggering a local payout to the recipient's bank account
 * once USDC has settled. 1:1 net routing — no markup is applied at this leg.
 */
async function triggerLocalPayout(
  usdcAmount: number,
  bankCode: string,
  accountNumber: string
): Promise<OfframpPayoutResult> {
  const offrampBaseUrl = process.env.OFFRAMP_API_BASE_URL;
  const offrampApiKey = process.env.OFFRAMP_API_KEY;

  await axios
    .post(
      `${offrampBaseUrl}/v1/payouts`,
      {
        amount: usdcAmount.toFixed(2),
        currency: "usd",
        bank_code: bankCode,
        account_number: accountNumber,
      },
      {
        headers: {
          Authorization: `Bearer ${offrampApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      }
    )
    .catch(() => {
      // Sandbox call intentionally swallowed for mock mode; real
      // integration should propagate this error to the caller.
    });

  return {
    offramp_reference_id: `offramp_${Date.now()}`,
    payout_amount_usd: usdcAmount, // 1:1, no markup
    bank_code: bankCode,
    account_number: accountNumber,
    status: "completed",
  };
}

router.post("/", async (req: Request, res: Response) => {
  const body = req.body;

  if (!isValidPayoutRequest(body)) {
    return res.status(400).json({
      status: "error",
      message:
        "Invalid payload. Expected { amount_usd: number, sender_id: string, recipient_bank_code: string, recipient_account_number: string }",
    });
  }

  const { amount_usd, sender_id, recipient_bank_code, recipient_account_number } = body;

  try {
    const bridgeResult = await routeThroughBridge(amount_usd, sender_id);

    const offrampResult = await triggerLocalPayout(
      bridgeResult.usdc_amount,
      recipient_bank_code,
      recipient_account_number
    );

    return res.status(200).json({
      status: "success",
      message: "Payout routed and settled successfully",
      data: {
        sender_id,
        amount_usd,
        routing: {
          bridge_transfer_id: bridgeResult.bridge_transfer_id,
          network: bridgeResult.network,
          usdc_amount: bridgeResult.usdc_amount,
        },
        payout: {
          offramp_reference_id: offrampResult.offramp_reference_id,
          bank_code: offrampResult.bank_code,
          account_number: offrampResult.account_number,
          payout_amount_usd: offrampResult.payout_amount_usd,
        },
      },
    });
  } catch (err) {
    console.error("Payout orchestration failed:", err);
    return res.status(502).json({
      status: "error",
      message: "Payout routing failed during orchestration",
    });
  }
});

export default router;
