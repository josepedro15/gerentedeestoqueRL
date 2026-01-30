import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { tools } from '@/lib/ai/tools';
import { supabase } from '@/lib/supabase';
import { getUpcomingSeasonality } from '@/lib/seasonality';

export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        const { messages, userId, sessionId } = await req.json();

        // ... (validation)

        // Get Seasonality Context
        const events = getUpcomingSeasonality();
        let sazonalidadeContext = "";

        const imminentEvents = events.filter(e => e.daysUntil <= 60);
        console.log(`[Chat API] Seasonality Check: Found ${imminentEvents.length} imminent events.`);

        if (imminentEvents.length > 0) {
            const event = imminentEvents[0]; // Focus on the most immediate one
            console.log(`[Chat API] Injecting context for: ${event.name} (${event.daysUntil} days)`);

            sazonalidadeContext = `
            CONTEXTO DE MOMENTO (SAZONALIDADE):
            O evento "${event.name}" está chegando em ${event.daysUntil} dias.
            Descrição: ${event.description}.
            DICA: Se o usuário pedir sugestões de campanha ou análise de mix, USE essa informação para sugerir ações temáticas.
            `;
        } else {
            console.log("[Chat API] No imminent events found.");
        }

        const result = streamText({
            model: google('gemini-2.5-pro') as any,
            messages,
            tools: tools,
            maxSteps: 5,
            system: `Você é o Assistente IA do SmartOrders, operando com a arquitetura Gemini 2.5 Pro.

            OBJETIVO PRINCIPAL:
            Atuar como um especialista em Logística e Gestão de Estoque, fornecendo análises precisas baseadas EXCLUSIVAMENTE nos dados do banco de dados.

            FLUXO DE TRABALHO (Raciocínio):
            1. ENTENDER A PERGUNTA: O que o usuário quer? (Ex: "Estoque de cimento" ou "O que preciso comprar?").
            2. CRIAR FILTRO (TOOL CALL): 
               - IMPORTANTE: Invoque a funcao analyzeStock IMEDIATAMENTE ao identificar a intencao.
               - Se for um produto especifico -> use analyzeStock com query (Ex: cimento).
               - Se for uma analise geral/compra -> use analyzeStock com filter=low_stock.
            3. ANALISAR DADOS: O sistema retornará os dados brutos.
            4. RESPONDER: Use os dados retornados para construir a resposta.

            REGRAS DE OURO:
            - NUNCA invente dados. Se a tool não retornar nada, diga que não encontrou.
            - TABELA REAL: "dados_estoque".
            - IGNORE referências a tabelas antigas como "v_produtos".
            - Ao fazer análises de compra, foque nos itens com Status "Ruptura" ou "Crítico".
            - Seja assertivo. Dê recomendações claras baseadas na coluna 'sugestao_compra_ajustada'.
            - DADOS OBRIGATÓRIOS: Ao listar produtos, você DEVE apresentar:
              * Estoque Atual
              * Preço de Custo ('custo')
              * Preço de Venda ('preco')
              * Valor Sugerido do Pedido (se for compra): Quantidade Sugerida * Custo.
            
            Personalidade:
            - Profissional, Analítico e Direto.
            - Fale Português (PT-BR).

            ${sazonalidadeContext}
            `,
            onFinish: async ({ text, toolCalls, toolResults }) => {
                console.log("[Chat API] Finished. Text length:", text.length, "Tool calls:", toolCalls?.length || 0);

                // Persistence Logic
                try {
                    if (sessionId && userId) {
                        // 1. Save User Message (the last one in the array)
                        const lastUserMsg = messages[messages.length - 1];
                        if (lastUserMsg && lastUserMsg.role === 'user') {
                            const { error: errUser } = await supabase.from('chat_history').insert({
                                session_id: sessionId,
                                user_id: userId,
                                role: 'user',
                                content: lastUserMsg.content,
                                metadata: {}
                            });
                            if (errUser) console.error("Error saving user message:", errUser.message);
                        }

                        // 2. Save AI Response with Logic/Tool Context
                        const { error: errAI } = await supabase.from('chat_history').insert({
                            session_id: sessionId,
                            user_id: userId,
                            role: 'assistant',
                            content: text,
                            metadata: {
                                toolCalls: toolCalls || [],
                                toolResults: toolResults || []
                            }
                        });
                        if (errAI) console.error("Error saving AI message:", errAI.message);
                    }
                } catch (saveError) {
                    console.error("Failed to save chat history:", saveError);
                }
            },
        });



        return result.toDataStreamResponse({
            getErrorMessage: (error) => {
                if (error instanceof Error) return error.message;
                return 'An unknown error occurred';
            }
        });

    } catch (e: any) {
        console.error("[Chat API Error]:", e);
        return new Response(JSON.stringify({ error: e.message || 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
