"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Send, Package, X, Loader2, Flame, Check, Sparkles, Filter, ChevronDown, ChevronUp, ShoppingCart } from "lucide-react";
import { getStockData } from "@/app/actions/inventory";

import { cn } from "@/lib/utils";
import { normalizeStatus, parseNumber } from "@/lib/formatters";
import {
    STATUS_COLORS_COMPACT,
    ABC_COLORS_COMPACT,
    STATUS_OPTIONS,
    ABC_OPTIONS,
    COVERAGE_RANGES,
    ALERT_OPTIONS,
    ALERT_COLORS
} from "@/lib/constants";

interface ProductSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

interface SimpleProduct {
    id: string;
    nome: string;
    estoque: number;
    abc: string;
    status: string;
    cobertura: number;
    preco: number;
    alerta: string;
    rawData: any;
}

export function ProductSidebar({ isOpen, onClose }: ProductSidebarProps) {
    const [products, setProducts] = useState<SimpleProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    // Nova: seleção múltipla para campanhas
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Filtros
    const [showFilters, setShowFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [abcFilter, setAbcFilter] = useState<string[]>([]);
    const [coberturaFilter, setCoberturaFilter] = useState<string[]>([]);
    const [alertFilter, setAlertFilter] = useState<string[]>([]);

    // Ordenação
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

    // Toggle Ordenação Estoque
    const toggleSort = () => {
        setSortOrder(prev => {
            if (prev === null) return 'desc';
            if (prev === 'desc') return 'asc';
            return null;
        });
    };

    // Toggle de filtros
    const toggleStatusFilter = (status: string) => {
        setStatusFilter(prev =>
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };
    const toggleAbcFilter = (abc: string) => {
        setAbcFilter(prev =>
            prev.includes(abc) ? prev.filter(a => a !== abc) : [...prev, abc]
        );
    };
    const toggleCoberturaFilter = (value: string) => {
        setCoberturaFilter(prev =>
            prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
        );
    };
    const toggleAlertFilter = (value: string) => {
        setAlertFilter(prev =>
            prev.includes(value) ? prev.filter(a => a !== value) : [...prev, value]
        );
    };
    const clearFilters = () => {
        setStatusFilter([]);
        setAbcFilter([]);
        setCoberturaFilter([]);
        setAlertFilter([]);
        setSortOrder(null);
    };
    const hasActiveFilters = statusFilter.length > 0 || abcFilter.length > 0 || coberturaFilter.length > 0 || alertFilter.length > 0 || sortOrder !== null;



    // Carregar produtos
    useEffect(() => {
        let mounted = true;

        async function loadProducts() {
            try {
                setLoading(true);
                setError(null);

                const result = await getStockData();

                if (!mounted) return;

                if (!result?.produtos) {
                    setProducts([]);
                    return;
                }

                const simpleProducts: SimpleProduct[] = result.produtos
                    .filter((p: any) => p?.id_produto)
                    .map((p: any) => {
                        // Normalizar alerta do banco (ex: '💀 MORTO' -> 'MORTO')
                        const alertaEstoque = String(p.alerta_estoque || '').toUpperCase();
                        const statusRuptura = normalizeStatus(p.status_ruptura);

                        let alerta = '';
                        if (alertaEstoque.includes('MORTO')) alerta = 'MORTO';
                        else if (alertaEstoque.includes('LIQUIDAR')) alerta = 'LIQUIDAR';
                        // Ruptura/Crítico vem do status, não do alerta_estoque
                        else if (statusRuptura === 'RUPTURA' || statusRuptura === 'CRÍTICO') alerta = 'RUPTURA';

                        return {
                            id: String(p.id_produto || ''),
                            nome: String(p.produto_descricao || 'Sem nome'),
                            estoque: parseNumber(p.estoque_atual),
                            abc: String(p.classe_abc || 'C').toUpperCase().trim(),
                            status: statusRuptura,
                            cobertura: parseNumber(p.dias_de_cobertura),
                            preco: parseNumber(p.preco),
                            alerta,
                            rawData: p,
                        };
                    });

                // Deduplicar produtos por ID para evitar chaves duplicadas e bugs de seleção
                const uniqueProducts = Array.from(
                    new Map(simpleProducts.map(p => [p.id, p])).values()
                );

                // Exibir todos os produtos (sem limite)
                setProducts(uniqueProducts);
            } catch (err: any) {
                console.error("Erro ProductSidebar:", err);
                if (mounted) {
                    setError("Erro ao carregar produtos");
                    setProducts([]);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }

        loadProducts();

        return () => { mounted = false; };
    }, []);

    // Filtrar produtos conforme aba, busca e filtros
    const filteredProducts = useMemo(() => {
        let filtered = products;

        // Filtro por status
        if (statusFilter.length > 0) {
            filtered = filtered.filter(p => statusFilter.includes(p.status));
        }

        // Filtro por curva ABC
        if (abcFilter.length > 0) {
            filtered = filtered.filter(p => abcFilter.includes(p.abc));
        }

        // Filtro por cobertura
        if (coberturaFilter.length > 0) {
            filtered = filtered.filter(p => {
                return coberturaFilter.some(filterValue => {
                    const option = COVERAGE_RANGES.find(o => o.value === filterValue);
                    if (!option) return false;
                    return p.cobertura >= option.min && p.cobertura < option.max;
                });
            });
        }

        // Filtro por alerta (Mortos, Liquidar, Ruptura)
        if (alertFilter.length > 0) {
            filtered = filtered.filter(p => alertFilter.includes(p.alerta));
        }

        // Busca
        if (search.trim()) {
            const term = search.toLowerCase();
            filtered = filtered.filter(p =>
                p.nome.toLowerCase().includes(term) ||
                p.id.toLowerCase().includes(term)
            );
        }

        // Ordenação por estoque
        if (sortOrder) {
            filtered = [...filtered].sort((a, b) => { // Create a copy to avoid mutating state
                if (sortOrder === 'asc') return a.estoque - b.estoque;
                return b.estoque - a.estoque;
            });
        }

        return filtered;
    }, [products, search, statusFilter, abcFilter, coberturaFilter, alertFilter, sortOrder]);

    // Toggle seleção para campanhas
    const toggleSelection = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else if (selectedIds.length < 10) {
            setSelectedIds([...selectedIds, id]);
        }
    };

    // Enviar para análise individual - envia todos os dados da row
    const handleAnalyze = (product: SimpleProduct) => {
        try {
            window.dispatchEvent(new CustomEvent('chat:send-product', {
                detail: {
                    // Dados da visualização
                    codigo_produto: product.id,
                    nome_produto: product.nome,
                    estoque_atual: product.estoque,
                    classe_abc: product.abc,
                    status: product.status,
                    cobertura: product.cobertura,
                    preco: product.preco,
                    // Dados originais completos da row do banco
                    ...product.rawData
                }
            }));
            if (window.innerWidth < 1024) onClose();
        } catch (err) {
            console.error("Erro ao enviar produto:", err);
        }
    };





    // Ação em lote para produtos (Analisar ou Comprar)
    const handleBatchAction = (action: 'analyze' | 'buy') => {
        const selectedProducts = products.filter(p => selectedIds.includes(p.id));

        window.dispatchEvent(new CustomEvent('chat:analyze-batch', {
            detail: {
                mode: action === 'analyze' ? 'analysis' : 'purchase',
                products: selectedProducts.map(p => ({
                    codigo_produto: p.id,
                    nome_produto: p.nome,
                    estoque_atual: p.estoque,
                    preco: p.preco,
                    abc: p.abc,
                    status: p.status,
                    ...p.rawData
                }))
            }
        }));

        if (window.innerWidth < 1024) onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay mobile */}
            <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={onClose}
            />

            {/* Sidebar */}
            <aside className="fixed lg:relative left-0 top-0 h-full w-[85vw] max-w-80 sm:w-80 bg-card border-r border-border z-50 flex flex-col">
                {/* Tabs */}
                {/* Header da aba */}
                <div className="p-4 border-b border-border relative z-20 bg-background">
                    <div className="text-xs text-muted-foreground mb-3 flex justify-between items-center">
                        <span>Selecione produtos para análise ou compra</span>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground lg:hidden"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Search + Filter Toggle */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por nome ou SKU..."
                                className="w-full pl-9 pr-3 py-2 text-sm bg-accent border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "p-2 rounded-lg border transition-colors relative",
                                showFilters || hasActiveFilters
                                    ? "bg-blue-500/10 border-blue-500 text-blue-400"
                                    : "bg-accent border-border text-muted-foreground hover:text-foreground"
                            )}
                            title="Filtros"
                        >
                            <Filter size={16} />
                            {hasActiveFilters && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                            )}
                        </button>
                    </div>

                    {/* Filtros colapsáveis */}
                    {showFilters && (
                        <div className="mt-3 pt-3 border-t border-border space-y-3">
                            {/* Alertas */}
                            <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-2">Alertas</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {ALERT_OPTIONS.map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => toggleAlertFilter(option.value)}
                                            className={cn(
                                                "text-[10px] px-2 py-1 rounded-full border transition-colors",
                                                alertFilter.includes(option.value)
                                                    ? ALERT_COLORS[option.value]
                                                    : "bg-accent border-border text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-muted-foreground">Status</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {STATUS_OPTIONS.map(status => (
                                        <button
                                            key={status}
                                            onClick={() => toggleStatusFilter(status)}
                                            className={cn(
                                                "text-[10px] px-2 py-1 rounded-full border transition-colors",
                                                statusFilter.includes(status)
                                                    ? STATUS_COLORS_COMPACT[status] + " border-current"
                                                    : "bg-accent border-border text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Curva ABC */}
                            <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-2">Curva ABC</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {ABC_OPTIONS.map(abc => (
                                        <button
                                            key={abc}
                                            onClick={() => toggleAbcFilter(abc)}
                                            className={cn(
                                                "text-[10px] px-3 py-1 rounded-full border transition-colors font-bold",
                                                abcFilter.includes(abc)
                                                    ? ABC_COLORS_COMPACT[abc] + " border-current"
                                                    : "bg-accent border-border text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {abc}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cobertura */}
                            <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-2">Cobertura</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {COVERAGE_RANGES.map(option => (
                                        <button
                                            key={option.value}
                                            onClick={() => toggleCoberturaFilter(option.value)}
                                            className={cn(
                                                "text-[10px] px-2 py-1 rounded-full border transition-colors",
                                                coberturaFilter.includes(option.value)
                                                    ? "bg-blue-500/20 text-blue-400 border-blue-500"
                                                    : "bg-accent border-border text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Ordenação */}
                            <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-2">Ordenação</span>
                                <button
                                    onClick={toggleSort}
                                    className={cn(
                                        "flex items-center gap-2 text-[10px] px-3 py-1 rounded-full border transition-colors",
                                        sortOrder
                                            ? "bg-blue-500/20 text-blue-400 border-blue-500"
                                            : "bg-accent border-border text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Package size={12} />
                                    Estoque
                                    {sortOrder === 'asc' && <ChevronUp size={12} />}
                                    {sortOrder === 'desc' && <ChevronDown size={12} />}
                                </button>
                            </div>

                            {/* Limpar filtros */}
                            {hasActiveFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-left pt-2 border-t border-border mt-2"
                                >
                                    Limpar filtros
                                </button>
                            )}
                        </div>
                    )}

                    {/* Contador de resultados */}
                    {(hasActiveFilters || search.trim()) && !loading && (
                        <div className="mt-2 text-xs text-muted-foreground">
                            {filteredProducts.length} produto(s) encontrado(s)
                        </div>
                    )}
                </div>

                {/* Product List */}
                <div className="flex-1 overflow-y-auto relative z-10">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-3">
                            <Loader2 size={24} className="animate-spin text-blue-400" />
                            <span className="text-sm text-muted-foreground">Carregando...</span>
                        </div>
                    ) : error ? (
                        <div className="p-4 text-center text-red-400 text-sm">
                            {error}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            "Nenhum produto encontrado"
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {filteredProducts.map((product) => {
                                const isSelected = selectedIds.includes(product.id);

                                return (
                                    <div
                                        key={product.id}
                                        onClick={() => toggleSelection(product.id)}
                                        className={cn(
                                            "p-3 transition-colors cursor-pointer hover:bg-accent/50 border-l-4",
                                            isSelected
                                                ? "bg-blue-500/10 border-blue-500"
                                                : "border-transparent"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            {/* Checkbox Visual Unificado */}
                                            <div className="flex items-center h-full pt-1">
                                                <div className={cn(
                                                    "w-5 h-5 rounded flex items-center justify-center border-2 transition-all duration-150",
                                                    isSelected
                                                        ? "bg-blue-500 border-blue-500"
                                                        : "border-gray-400 bg-transparent"
                                                )}>
                                                    {isSelected && (
                                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0 ml-2">
                                                <p className="font-medium text-foreground text-sm truncate" title={product.nome}>
                                                    {product.nome}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-muted-foreground font-mono">
                                                        {product.id}
                                                    </span>
                                                    <span className={cn(
                                                        "text-[10px] px-1.5 py-0.5 rounded font-bold",
                                                        ABC_COLORS_COMPACT[product.abc] || ABC_COLORS_COMPACT['C']
                                                    )}>
                                                        {product.abc}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={cn(
                                                        "text-[10px] px-1.5 py-0.5 rounded",
                                                        STATUS_COLORS_COMPACT[product.status] || STATUS_COLORS_COMPACT['SAUDÁVEL']
                                                    )}>
                                                        {product.status}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {product.estoque.toLocaleString('pt-BR')} un
                                                    </span>

                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>


                {/* Footer: acoes em lote para produtos */}
                {selectedIds.length > 0 && (
                    <div className="p-4 border-t border-border bg-muted/50 grid grid-cols-2 gap-3">
                        <button
                            onClick={() => handleBatchAction('analyze')}
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                        >
                            <Sparkles size={18} />
                            Analisar ({selectedIds.length})
                        </button>
                        <button
                            onClick={() => handleBatchAction('buy')}
                            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                        >
                            <ShoppingCart size={18} />
                            Comprar ({selectedIds.length})
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}
