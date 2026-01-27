"use client";

import { useState, useEffect } from "react";
import { CampaignStrategy } from "@/app/actions/marketing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, ArrowLeft, Copy, Check, MessageCircle, Instagram, Store, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUpcomingSeasonality, SeasonalityEvent } from "@/lib/seasonality";

interface CampaignEditorProps {
    strategy: CampaignStrategy;
    onBack: () => void;
    onSend: (finalStrategy: CampaignStrategy) => void;
    isSending: boolean;
}

export function CampaignEditor({ strategy, onBack, onSend, isSending }: CampaignEditorProps) {
    const [editableStrategy, setEditableStrategy] = useState<CampaignStrategy>(strategy);
    const [activeTab, setActiveTab] = useState("report");
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [upcomingEvent, setUpcomingEvent] = useState<SeasonalityEvent | null>(null);

    useEffect(() => {
        const events = getUpcomingSeasonality();
        if (events.length > 0 && events[0].daysUntil <= 60) {
            setUpcomingEvent(events[0]);
        }
    }, []);

    // State for Visuals
    const [generatingVisual, setGeneratingVisual] = useState<'instagram' | 'physical' | null>(null);
    const [visuals, setVisuals] = useState<{ instagram?: string, physical?: string }>({});

    // Action: Generate Image
    const handleGenerateImage = async (type: 'instagram' | 'physical') => {
        const prompt = type === 'instagram'
            ? editableStrategy.channels.instagram.image_prompt
            : editableStrategy.channels.physical.image_prompt;

        if (!prompt) {
            alert("Prompt de imagem não encontrado.");
            return;
        }

        setGeneratingVisual(type);
        try {
            const { generateMarketingImage } = await import("@/app/actions/nanobanana");
            // Map 'physical' UI type to 'pdv' API type
            const apiType = type === 'physical' ? 'pdv' : type;
            const result = await generateMarketingImage(prompt, apiType);

            if (result.success && result.imageUrl) {
                setVisuals(prev => ({ ...prev, [type]: result.imageUrl }));
            } else {
                alert("Erro ao gerar imagem: " + (result.error || "Desconhecido"));
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao conectar com API.");
        } finally {
            setGeneratingVisual(null);
        }
    };

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const updateChannel = (channel: 'whatsapp' | 'instagram' | 'physical', field: string, value: string) => {
        setEditableStrategy(prev => ({
            ...prev,
            channels: {
                ...prev.channels,
                [channel]: {
                    ...prev.channels[channel as keyof typeof prev.channels],
                    [field]: value
                }
            }
        }));
    };

    const handlePriceUpdate = (index: number, field: string, value: string | number) => {
        const newPricing = [...(editableStrategy.pricing_strategy || [])];
        newPricing[index] = { ...newPricing[index], [field]: value };
        setEditableStrategy(prev => ({ ...prev, pricing_strategy: newPricing }));
    };

    const renderWhatsAppPreview = (text: string) => {
        // Simple bold parser for *text*
        // Note: property is 'script' (fixed typo from backend)
        const parts = text.split(/(\*[^*]+\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('*') && part.endsWith('*')) {
                return <b key={i}>{part.slice(1, -1)}</b>;
            }
            return part;
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header Actions */}
            <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={onBack} className="gap-2">
                    <ArrowLeft size={16} /> Voltar
                </Button>
                <div className="flex items-center gap-3">
                    {upcomingEvent && (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-semibold border border-amber-200 animate-pulse">
                            <CalendarDays size={14} />
                            {upcomingEvent.name} em {upcomingEvent.daysUntil} dias ({upcomingEvent.date.getDate()}/{upcomingEvent.date.getMonth() + 1})
                        </div>
                    )}
                    <Button
                        onClick={() => onSend(editableStrategy)}
                        disabled={isSending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-lg shadow-emerald-900/20"
                    >
                        <Send size={16} />
                        {isSending ? "Enviando..." : "Enviar para Marketing"}
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
                    <TabsTrigger value="report">Estratégia</TabsTrigger>
                    <TabsTrigger value="dissemination">Divulgação</TabsTrigger>
                    <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                    <TabsTrigger value="instagram">Instagram</TabsTrigger>
                    <TabsTrigger value="physical">Loja Física</TabsTrigger>
                </TabsList>

                {/* STRATEGY REPORT TAB */}
                <TabsContent value="report" className="mt-6 space-y-6">
                    <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/10">
                        <CardHeader>
                            <CardTitle className="text-2xl font-bold flex items-center justify-between">
                                {strategy.report.title}
                                <Badge variant="outline" className="text-blue-600 border-blue-200">Estratégia</Badge>
                            </CardTitle>
                            <CardDescription>Análise da Campanha Gerada pela IA</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="p-4 bg-background rounded-lg border shadow-sm">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Público-Alvo</h3>
                                    <p className="text-foreground font-medium">{editableStrategy.report.target_audience}</p>
                                </div>
                                <div className="p-4 bg-background rounded-lg border shadow-sm">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Gancho (Hook)</h3>
                                    <p className="text-foreground font-medium text-emerald-600">{editableStrategy.report.hook}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-background rounded-lg border shadow-sm">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Análise de Coerência (Mix)</h3>
                                <p className="leading-relaxed">{editableStrategy.report.coherence_analysis}</p>
                            </div>

                            <div className="p-4 bg-background rounded-lg border shadow-sm">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-4">ESTRATÉGIA DE PRECIFICAÇÃO (Editável)</h3>
                                {editableStrategy.pricing_strategy && editableStrategy.pricing_strategy.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b text-muted-foreground">
                                                    <th className="text-left py-2 font-medium w-[200px]">Produto</th>
                                                    <th className="text-right py-2 font-medium w-[100px]">Custo</th>
                                                    <th className="text-right py-2 font-medium w-[100px]">Preço Orig.</th>
                                                    <th className="text-right py-2 font-medium w-[120px]">Sugestão</th>
                                                    <th className="text-right py-2 font-medium w-[80px]">Desc. %</th>
                                                    <th className="text-right py-2 font-medium w-[80px]">Margem %</th>
                                                    <th className="text-left pl-4 py-2 font-medium">Tática</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {editableStrategy.pricing_strategy.map((item, idx) => (
                                                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                                                        <td className="py-2 pr-2 font-medium">{item.product_name}</td>
                                                        <td className="text-right py-2 px-1">
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-full text-right"
                                                                value={item.cost}
                                                                onChange={e => handlePriceUpdate(idx, 'cost', Number(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="text-right py-2 px-1 text-muted-foreground line-through">
                                                            R$ {item.original_price?.toFixed(2)}
                                                        </td>
                                                        <td className="text-right py-2 px-1">
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-full text-right font-bold text-emerald-600"
                                                                value={item.suggested_price}
                                                                onChange={e => handlePriceUpdate(idx, 'suggested_price', Number(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="text-right py-2 px-1">
                                                            <Input
                                                                type="number"
                                                                className="h-8 w-full text-right text-red-500"
                                                                value={item.discount_percent}
                                                                onChange={e => handlePriceUpdate(idx, 'discount_percent', Number(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="text-right py-2 px-1">
                                                            <div className="flex items-center justify-end h-8 text-xs">{item.margin_percent}%</div>
                                                        </td>
                                                        <td className="pl-4 py-2">
                                                            <Input
                                                                className="h-8 w-full text-xs italic"
                                                                value={item.tactic}
                                                                onChange={e => handlePriceUpdate(idx, 'tactic', e.target.value)}
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground italic">Nenhuma estratégia de preço detalhada disponível para este relatório.</p>
                                )}
                            </div>

                            <div className="p-4 bg-background rounded-lg border shadow-sm">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Feedback do Mix ABC</h3>
                                <div className="flex items-start gap-2">
                                    <Check className="w-5 h-5 text-green-500 mt-0.5" />
                                    <p className="text-sm">{editableStrategy.report.mix_feedback}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB: DISSEMINATION --- */}
                <TabsContent value="dissemination" className="mt-6 space-y-6">
                    <Card className="border-indigo-100 dark:border-indigo-900/50">
                        <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 pb-4">
                            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                                <Send size={20} />
                                <CardTitle>Estratégia de Divulgação</CardTitle>
                            </div>
                            <CardDescription>Canais, Táticas e Cronograma</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 pt-6 space-y-6">
                            {editableStrategy.dissemination_strategy ? (
                                <>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-muted-foreground">Canais Sugeridos</h3>
                                            <div className="flex flex-wrap gap-2">
                                                {editableStrategy.dissemination_strategy.channels?.map((channel, i) => (
                                                    <Badge key={i} variant="secondary" className="px-3 py-1">{channel}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-muted-foreground">Alocação de Verba (Sugestão)</h3>
                                            <Input
                                                value={editableStrategy.dissemination_strategy.budget_allocation || ''}
                                                onChange={e => setEditableStrategy(prev => ({ ...prev, dissemination_strategy: { ...prev.dissemination_strategy!, budget_allocation: e.target.value } }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold text-muted-foreground">Táticas de Tráfego & Engajamento</h3>
                                        <ul className="list-disc pl-5 space-y-1 text-sm">
                                            {editableStrategy.dissemination_strategy.tactics?.map((tactic, i) => (
                                                <li key={i}>{tactic}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold text-muted-foreground">Cronograma (Timeline)</h3>
                                        <Textarea
                                            value={editableStrategy.dissemination_strategy.timeline || ''}
                                            onChange={e => setEditableStrategy(prev => ({ ...prev, dissemination_strategy: { ...prev.dissemination_strategy!, timeline: e.target.value } }))}
                                            className="min-h-[100px]"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-10 text-muted-foreground">
                                    <p>Nenhuma estratégia de divulgação gerada. Gere a campanha novamente para incluir este módulo.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB: WHATSAPP --- */}
                <TabsContent value="whatsapp" className="mt-6 grid md:grid-cols-2 gap-6">
                    <Card className="flex flex-col h-full border-emerald-100 dark:border-emerald-900/50">
                        <CardHeader className="bg-emerald-50/50 dark:bg-emerald-950/20 pb-4">
                            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                <MessageCircle size={20} />
                                <CardTitle>WhatsApp</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 pt-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Gatilho de Envio</label>
                                <Input
                                    value={editableStrategy.channels.whatsapp.trigger}
                                    onChange={(e) => updateChannel('whatsapp', 'trigger', e.target.value)}
                                    className="bg-muted/30"
                                />
                            </div>
                            <div className="space-y-2 flex-1 flex flex-col">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-muted-foreground">Mensagem (Script)</label>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(editableStrategy.channels.whatsapp?.script || '', 'wa')}>
                                        {copiedField === 'wa' ? <Check size={12} /> : <Copy size={12} />}
                                    </Button>
                                </div>
                                <Textarea
                                    value={editableStrategy.channels.whatsapp?.script || ''}
                                    onChange={(e) => updateChannel('whatsapp', 'script', e.target.value)}
                                    className="min-h-[300px] flex-1 font-mono text-sm bg-stone-50 dark:bg-stone-900/50 leading-relaxed p-4 border-stone-200"
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <div className="bg-slate-100 rounded-3xl p-4 border-4 border-slate-200 h-fit max-w-sm mx-auto shadow-xl">
                        <div className="bg-[#DCF8C6] rounded-lg p-3 text-sm shadow-sm relative text-black mb-2">
                            <p className="whitespace-pre-wrap">
                                {renderWhatsAppPreview(editableStrategy.channels.whatsapp?.script || '')}
                            </p>
                            <span className="text-[10px] text-gray-500 block text-right mt-1">10:42</span>
                        </div>
                    </div>
                </TabsContent>

                {/* --- TAB: INSTAGRAM --- */}
                <TabsContent value="instagram" className="mt-6 space-y-6">
                    <Card className="flex flex-col h-full border-pink-100 dark:border-pink-900/50">
                        <CardHeader className="bg-pink-50/50 dark:bg-pink-950/20 pb-4">
                            <div className="flex items-center gap-2 text-pink-700 dark:text-pink-400">
                                <Instagram size={20} />
                                <CardTitle>Instagram</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 pt-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Legenda (Copy)</label>
                                <Textarea
                                    value={editableStrategy.channels.instagram.copy}
                                    onChange={(e) => updateChannel('instagram', 'copy', e.target.value)}
                                    className="min-h-[150px] text-sm"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Prompt para Imagem (IA)</label>
                                <Textarea
                                    value={editableStrategy.channels.instagram.image_prompt}
                                    onChange={(e) => updateChannel('instagram', 'image_prompt', e.target.value)}
                                    className="min-h-[100px] text-xs bg-muted/30 font-mono text-muted-foreground"
                                    placeholder="Prompt em inglês para gerar a imagem..."
                                />
                            </div>
                            <Button
                                onClick={() => handleGenerateImage('instagram')}
                                disabled={generatingVisual === 'instagram'}
                                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                            >
                                {generatingVisual === 'instagram' ? "Gerando Arte (Gemini)..." : "Gerar Arte Instagram"}
                            </Button>
                            <div className="border rounded-xl p-4 flex flex-col items-center justify-center bg-muted/10 min-h-[300px]">
                                {visuals.instagram ? (
                                    <div className="space-y-2 w-full">
                                        <img src={visuals.instagram} alt="Instagram Art" className="rounded-lg shadow-md w-full object-cover" />
                                        <p className="text-xs text-center text-muted-foreground">Gerado por Gemini</p>
                                    </div>
                                ) : (
                                    <div className="text-center text-muted-foreground">
                                        <p>Nenhuma arte gerada ainda.</p>
                                        <p className="text-xs">Clique no botão acima para criar.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* --- TAB: PHYSICAL (PDV) --- */}
                <TabsContent value="physical" className="mt-6 space-y-6">
                    <Card className="flex flex-col h-full border-orange-100 dark:border-orange-900/50">
                        <CardHeader className="bg-orange-50/50 dark:bg-orange-950/20 pb-4">
                            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                                <Store size={20} />
                                <CardTitle>Ponto de Venda</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 pt-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Manchete (Cartaz)</label>
                                <Input
                                    value={editableStrategy.channels.physical.headline}
                                    onChange={(e) => updateChannel('physical', 'headline', e.target.value)}
                                    className="font-bold text-lg"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Oferta Principal</label>
                                <Input
                                    value={editableStrategy.channels.physical.offer}
                                    onChange={(e) => updateChannel('physical', 'offer', e.target.value)}
                                    className="text-red-500 font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Sub-título / Detalhes</label>
                                <Textarea
                                    value={editableStrategy.channels.physical.subheadline || ''}
                                    onChange={(e) => updateChannel('physical', 'subheadline', e.target.value)}
                                    className="h-[80px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-muted-foreground">Prompt do Cartaz (IA)</label>
                                <Textarea
                                    value={editableStrategy.channels.physical.image_prompt || ''}
                                    onChange={(e) => updateChannel('physical', 'image_prompt', e.target.value)}
                                    className="min-h-[100px] text-xs bg-muted/30 font-mono text-muted-foreground"
                                    placeholder="Prompt em inglês para gerar o cartaz..."
                                />
                            </div>
                            <Button
                                onClick={() => handleGenerateImage('physical')}
                                disabled={generatingVisual === 'physical'}
                                className="w-full"
                            >
                                <Store className="mr-2" size={16} />
                                {generatingVisual === 'physical' ? "Criando Cartaz..." : "Gerar Cartaz PDV"}
                            </Button>
                            <div className="border rounded-xl p-4 flex flex-col items-center justify-center bg-muted/10 min-h-[300px]">
                                {visuals.physical ? (
                                    <div className="space-y-2 w-full">
                                        <img src={visuals.physical} alt="PDV Poster" className="rounded-lg shadow-md w-full object-cover" />
                                        <p className="text-xs text-center text-muted-foreground">Cartaz Gerado por Gemini</p>
                                    </div>
                                ) : (
                                    <div className="text-center text-muted-foreground">
                                        <p>Nenhuma arte gerada ainda.</p>
                                        <p className="text-xs">Clique no botão acima para criar.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
