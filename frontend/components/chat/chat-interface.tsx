"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StrategicPlanCard } from './StrategicPlanCard';
import { CampaignCard } from './CampaignCard';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { getOrCreateSessionId, fetchAuthenticatedUserId } from '@/lib/chat-session';
import { getChatHistory, clearChatSession } from '@/app/actions/chatHistory';
import { Send, Bot, User, Maximize2, Minimize2, ExternalLink, Trash2, Loader2, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat as useSidebarChat } from "@/contexts/ChatContext";
import { useChat } from "@ai-sdk/react";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { saveCampaign, generateCampaign } from "@/app/actions/marketing";
import { uploadImageToStorage } from "@/lib/storage";
import { createBrowserClient } from "@supabase/ssr";
import { sendActionPlanRequest } from "@/app/actions/action-plan";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
    type?: 'text' | 'campaign' | 'campaign_plan';
    campaignData?: any;
    planData?: any;
}

// Helper auxiliar para parsear o conteúdo da mensagem
function parseMessageContent(content: string) {
    if (!content) return { type: 'text', content: '' };

    // Tenta encontrar JSON no conteúdo
    try {
        const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

        if (jsonMatch) {
            const jsonStr = jsonMatch[0];
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === 'campaign_plan' && parsed.plan) {
                return { type: 'campaign_plan', planData: parsed.plan, original: parsed, content: content.replace(jsonStr, '').trim() };
            }
            if (parsed.channels) {
                return { type: 'campaign', campaignData: { campaign: parsed, products: [] }, original: parsed, content: content.replace(jsonStr, '').trim() };
            }
            if (parsed.type === 'error') {
                return { type: 'text', content: parsed.message || 'Erro' };
            }
        }
    } catch (e) {
        // Ignora erro de parse e retorna texto
    }
    return { type: 'text', content };
}

// Clean markdown content - remove JSON output artifacts if they persist in text
const cleanContent = (text: string): string => {
    let cleaned = text;
    cleaned = cleaned.replace(/^```markdown\s * /, '').replace(/ ^ ```json\s*/, '').replace(/^```\s * /, '').replace(/```$/, '');
    return cleaned;
};




export function ChatInterface({ fullPage = false, hideHeader = false, userId: propUserId, sessionId: propSessionId }: { fullPage?: boolean; hideHeader?: boolean; userId?: string; sessionId?: string }) {
    const { isOpen, closeChat } = useSidebarChat();
    const [isExpanded, setIsExpanded] = useState(false);

    const [sessionId, setSessionId] = useState<string>(propSessionId || "");
    const [userId, setUserId] = useState<string>(propUserId || "");
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);

    const { messages, append, isLoading, setMessages, reload } = useChat({
        api: typeof window !== 'undefined' ? `${window.location.origin}/api/chat` : '/api/chat',
        body: { userId, sessionId },
        onError: (error) => {
            console.error("AI Chat Error:", error);
        }
    });

    const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Sync props with state if they change
    useEffect(() => {
        if (propUserId) setUserId(propUserId);
    }, [propUserId]);

    useEffect(() => {
        if (propSessionId && propSessionId !== sessionId) {
            setSessionId(propSessionId);
            setHasLoadedHistory(false); // Trigger reload
        }
    }, [propSessionId]);

    useEffect(() => {
        // If we already have props, don't auto-fetch/create default unless needed
        const initializeSession = async () => {
            let currentUserId = userId;

            if (!currentUserId) {
                currentUserId = await fetchAuthenticatedUserId();
                if (currentUserId) setUserId(currentUserId);
            }

            if (!currentUserId) {
                console.warn("Usuário não autenticado");
                setIsLoadingHistory(false);
                return;
            }

            // If sessionId is not set (and not passed as prop), create/get default
            let currentSessionId = sessionId;
            if (!currentSessionId && !propSessionId) {
                currentSessionId = getOrCreateSessionId();
                setSessionId(currentSessionId);
            }

            // Load History
            try {
                setIsLoadingHistory(true);
                const history = await getChatHistory(currentUserId, 100);

                // Determine which session to load
                let targetSession = null;

                if (propSessionId) {
                    // Try to find the requested session
                    targetSession = history.find((s: any) => s.session_id === propSessionId);
                    // If not found, it's a new chat (targetSession is null), so we clear messages
                } else if (history && history.length > 0) {
                    // Default behavior: load most recent
                    targetSession = history[0];
                    if (targetSession.session_id) {
                        setSessionId(targetSession.session_id);
                        localStorage.setItem('chat_session_id', targetSession.session_id);
                    }
                }

                if (targetSession) {
                    const formattedMessages = targetSession.messages.map((m: any) => {
                        let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

                        // Restore Tool Context from Metadata
                        if (m.metadata?.toolResults && Array.isArray(m.metadata.toolResults)) {
                            const toolOutputs = m.metadata.toolResults
                                .map((t: any) => t.result)
                                .filter((r: any) => r && typeof r === 'string' && r.length > 0)
                                .join('\n\n');

                            if (toolOutputs) {
                                content += `\n\n---\n**Contexto Recuperado:**\n${toolOutputs}`;
                            }
                        }

                        return {
                            id: m.id || crypto.randomUUID(),
                            role: m.role,
                            content: content,
                            createdAt: m.timestamp ? new Date(m.timestamp) : undefined
                        };
                    });

                    setMessages(formattedMessages);
                } else {
                    // Start fresh
                    setMessages([{
                        id: "welcome",
                        role: "assistant",
                        content: "Olá! Posso ajudar com análises de estoque ou sugestões de compra?",
                        createdAt: new Date()
                    }]);
                }
            } catch (e) {
                console.error("History load error", e);
                // Fallback
                setMessages([{
                    id: "welcome",
                    role: "assistant",
                    content: "Olá! Posso ajudar com análises de estoque ou sugestões de compra?",
                    createdAt: new Date()
                }]);
            } finally {
                setIsLoadingHistory(false);
                setHasLoadedHistory(true);
            }
        };

        // Trigger load only if history not loaded OR if we just switched sessions (hasLoadedHistory set to false)
        if (!hasLoadedHistory || (propSessionId && propSessionId !== sessionId)) {
            initializeSession();
        }

    }, [hasLoadedHistory, propSessionId, userId]); // Dependencies to re-run

    useEffect(() => {
        const handleProfileUpdate = () => {
            const stored = localStorage.getItem("user_profile");
            if (stored) {
                const profile = JSON.parse(stored);
                setUserAvatar(profile.avatar || null);
            }
        };
        window.addEventListener("user-profile-updated", handleProfileUpdate);
        return () => window.removeEventListener("user-profile-updated", handleProfileUpdate);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, isLoading]);


    const handleOpenPage = () => {
        closeChat();
        router.push('/chat');
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;
        await append({
            role: 'user',
            content: text
        });
    };

    const clearChatAction = useCallback(async () => {
        if (!userId || !sessionId) return;

        try {
            await clearChatSession(userId, sessionId);
            const newSessionId = crypto.randomUUID();
            localStorage.setItem('chat_session_id', newSessionId);
            setSessionId(newSessionId);
            setMessages([{
                id: "welcome",
                role: "assistant",
                content: "Conversa limpa! Como posso ajudar?",
                createdAt: new Date()
            }]);
        } catch (error) {
            console.error("Erro ao limpar histórico:", error);
        }
    }, [userId, sessionId, setMessages]);

    const handleClearChatClick = useCallback(() => {
        if (window.confirm("Tem certeza que deseja limpar o histórico desta conversa?")) {
            clearChatAction();
        }
    }, [clearChatAction]);

    useEffect(() => {
        const handleClearEvent = () => clearChatAction();
        window.addEventListener('chat:clear-history', handleClearEvent);
        return () => window.removeEventListener('chat:clear-history', handleClearEvent);
    }, [clearChatAction]);


    useEffect(() => {
        const handleProductEvent = async (e: CustomEvent) => {
            const data = e.detail;
            if (!data) return;

            let prompt = "";
            const nivelServico = data.nivel_servico || 0;
            const capital = data.capital_estoque || 0;

            if (data.source === 'dashboard' || data.is_dashboard_analysis) {
                const rupturas = data.risco?.itens_ruptura || 0;
                prompt = `Analise o estado geral do estoque.Ruptura: ${rupturas} itens.Capital Investido: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(capital)}. Nível de Serviço: ${nivelServico}%.O que priorizar ? `;
            } else {
                prompt = `Explique por que o sistema sugeriu comprar ${data.quantidade_sugerida || data.sugestao || 0} un do produto "${data.nome_produto || data.nome}"(SKU: ${data.codigo_produto || data.sku}).`;
            }

            append({
                role: 'user',
                content: prompt
            });
        };

        window.addEventListener("chat:send-product", handleProductEvent as unknown as EventListener);
        return () => window.removeEventListener("chat:send-product", handleProductEvent as unknown as EventListener);
    }, [append]);

    useEffect(() => {
        const handleBatchEvent = async (e: CustomEvent) => {
            const { mode, products } = e.detail;
            if (!products || products.length === 0) return;

            const productsList = products.map((p: any) =>
                `* ${p.nome || p.nome_produto || 'Produto Sem Nome'} (SKU: ${p.codigo_produto || p.id}): Estoque ${p.estoque_atual || p.estoque} un, ABC ${p.abc || 'N/A'}, ${p.status || 'N/A'}`
            ).join('\n');

            let prompt = "";
            if (mode === 'analysis') {
                prompt = `Atue como um Especialista em Estoque.Realize uma análise técnica detalhada dos seguintes ${products.length} produtos: \n\n${productsList} \n\nREGRAS: \n1.Diagnóstico: Analise o nível de cobertura atual.\n2.Sugira ações para cada item.\n3.Não gere pedido agora.`;
            } else if (mode === 'purchase') {
                prompt = `Gere ordens de compra para os seguintes produtos: \n\n${productsList} \n\nConsidere reposição para 30 dias.`;
            }

            append({
                role: 'user',
                content: prompt
            });
        };

        window.addEventListener("chat:analyze-batch", handleBatchEvent as unknown as EventListener);
        return () => window.removeEventListener("chat:analyze-batch", handleBatchEvent as unknown as EventListener);
    }, [append]);

    useEffect(() => {
        const handleActionPlanEvent = async (e: CustomEvent) => {
            const data = e.detail;
            if (!data) return;
            append({
                role: 'user',
                content: data.message
            });
        };
        window.addEventListener("chat:send-action-plan", handleActionPlanEvent as unknown as EventListener);
        return () => window.removeEventListener("chat:send-action-plan", handleActionPlanEvent as unknown as EventListener);
    }, [append]);

    useEffect(() => {
        const handleCampaignEvent = async (e: CustomEvent) => {
            const { campaign, products } = e.detail;
            const aiMsg = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: JSON.stringify({ type: 'campaign_plan', plan: campaign, generated: true }),
                createdAt: new Date()
            };
            // @ts-ignore
            setMessages(prev => [...prev, aiMsg]);
        };
        window.addEventListener("chat:campaign-generated", handleCampaignEvent as unknown as EventListener);
        return () => window.removeEventListener("chat:campaign-generated", handleCampaignEvent as unknown as EventListener);
    }, [setMessages]);

    const handleApproveAndGenerate = async (products: any[]) => {
        setIsGeneratingAssets(true);
        try {
            await append({
                role: 'user',
                content: "✅ Plano aprovado! Gere os ativos da campanha."
            });
        } catch (error) {
            console.error("Erro ao solicitar ativos:", error);
        } finally {
            setIsGeneratingAssets(false);
        }
    };

    return (
        <div className={cn(
            "flex flex-col overflow-hidden",
            fullPage ? "w-full h-full absolute inset-0" : "h-full"
        )}>
            {!fullPage && !hideHeader && (
                <div className="flex items-center justify-between p-3 border-b border-border bg-accent">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="font-medium text-foreground text-sm">Assistente IA (v2)</span>
                        {isLoadingHistory && (
                            <Loader2 size={12} className="animate-spin text-blue-400" />
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleClearChatClick}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Limpar conversa"
                        >
                            <Trash2 size={14} />
                        </button>
                        <button
                            onClick={handleOpenPage}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 hover:text-foreground text-xs font-medium transition-all border border-blue-500/30"
                        >
                            <ExternalLink size={14} />
                            Abrir Página
                        </button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={closeChat}>
                            <span className="sr-only">Fechar</span>
                            <User size={16} />
                        </Button>
                    </div>
                </div>
            )}

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 md:px-8 lg:px-16 py-4 space-y-4"
                style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-4xl mx-auto space-y-4">
                    {isLoadingHistory ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <Loader2 size={24} className="animate-spin text-blue-400" />
                            <span className="text-muted-foreground text-sm">Carregando histórico...</span>
                        </div>
                    ) : (
                        <>
                            {messages.map((msg) => {
                                const { type, planData, campaignData, content } = parseMessageContent(msg.content);
                                const isAssistant = msg.role === 'assistant';

                                return (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex gap-3 max-w-[80%]",
                                            !isAssistant ? "ml-auto flex-row-reverse" : ""
                                        )}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
                                            isAssistant ? "bg-blue-500/20 text-blue-400" : "bg-accent text-foreground"
                                        )}>
                                            {isAssistant ? (
                                                <Bot size={18} />
                                            ) : (
                                                userAvatar ? (
                                                    <img src={userAvatar} alt="User" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User size={18} />
                                                )
                                            )}
                                        </div>

                                        <div className={cn(
                                            "rounded-2xl p-4 text-sm shadow-sm",
                                            isAssistant
                                                ? "bg-card border border-border text-foreground rounded-tl-none"
                                                : "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 rounded-tr-none"
                                        )}>
                                            {/* Visualização de Tools */}
                                            {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                                                <div className="mb-3 space-y-2">
                                                    {msg.toolInvocations.map((tool: any) => (
                                                        <div key={tool.toolCallId} className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/50 text-xs text-muted-foreground border border-border/50">
                                                            {tool.state === 'result' ? (
                                                                <Check size={14} className="text-emerald-500 shrink-0" />
                                                            ) : (
                                                                <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
                                                            )}
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-foreground text-[10px] uppercase tracking-wider">
                                                                    {tool.toolName === 'analyzeStock' ? 'Analisando Estoque' :
                                                                        tool.toolName === 'generateMarketingCampaign' ? 'Criando Campanha' :
                                                                            'Processando'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {type === 'campaign_plan' ? (
                                                <StrategicPlanCard
                                                    plan={planData}
                                                    onApprove={(products) => handleApproveAndGenerate(products)}
                                                />
                                            ) : type === 'campaign' ? (
                                                <CampaignCard
                                                    campaign={campaignData?.campaign}
                                                    products={campaignData?.products}
                                                />
                                            ) : (
                                                isAssistant ? (
                                                    <MarkdownRenderer content={content || msg.content} />
                                                ) : (
                                                    <p className="whitespace-pre-wrap">{content || msg.content}</p>
                                                )
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            {isLoading && (
                                <div className="flex gap-3 max-w-[80%]">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-blue-500/20 text-blue-400">
                                        <Bot size={18} />
                                    </div>
                                    <div className="bg-card border border-border text-foreground rounded-2xl p-4 rounded-tl-none flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                        <span className="text-xs text-muted-foreground">Gerando resposta...</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="shrink-0 px-3 sm:px-4 md:px-8 lg:px-16 py-3 sm:py-4 border-t border-border/50 bg-background/80 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto">
                    {messages.length <= 1 && !isLoading && (
                        <div className="flex flex-wrap gap-2 mb-3 justify-center">
                            {[
                                { emoji: "📦", text: "Qual o estoque de cimento?" },
                                { emoji: "💰", text: "Qual o valor da argamassa?" },
                                { emoji: "🎯", text: "Como criar uma campanha?" },
                            ].map((action, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSendMessage(action.text)}
                                    className="px-3 py-1.5 text-xs rounded-full border border-border bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                                >
                                    <span>{action.emoji}</span>
                                    <span>{action.text}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <PromptInputBox
                        onSend={(message) => {
                            if (message.trim() && !isLoading && !isLoadingHistory) {
                                handleSendMessage(message);
                            }
                        }}
                        isLoading={isLoading}
                        placeholder="Digite sua pergunta sobre o estoque..."
                    />
                </div>
            </div>
        </div>
    );
}
