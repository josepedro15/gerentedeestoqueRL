'use server';

import { logger } from "@/lib/logger";

interface WhatsAppMessage {
    message: string;
    targetNumber?: string; // Optional, defaults to group/list
}

const WHATSAPP_API_ENDPOINT = process.env.WHATSAPP_API_ENDPOINT || '';
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || '';
const MARKETING_GROUP_ID = process.env.MARKETING_GROUP_ID || '120363048596644262@g.us'; // Exemplo de Group ID

export async function sendToMarketingGroup({ message }: WhatsAppMessage) {
    logger.info("Sending message to Marketing Group via WhatsApp...");

    if (!WHATSAPP_API_ENDPOINT) {
        logger.warn("WHATSAPP_API_ENDPOINT not configured. Logging message instead.");
        logger.info("MOCK SEND:", message);
        return { success: true, mock: true };
    }

    try {
        const response = await fetch(WHATSAPP_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
                'token': WHATSAPP_API_TOKEN // Alguns serviços usam header 'token'
            },
            body: JSON.stringify({
                number: MARKETING_GROUP_ID,
                body: message, // Wazzup style
                message: message // Generic style
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("WhatsApp API Error:", errorText);
            throw new Error("Failed to send WhatsApp message");
        }

        const data = await response.json();
        logger.info("WhatsApp sent successfully:", data);
        return { success: true, data };

    } catch (e: any) {
        logger.error("Error sending WhatsApp:", e);
        return { success: false, error: e.message };
    }
}
