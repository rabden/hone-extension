import React, { useState, useEffect } from "react";
import {
  Key,
  Keyboard,
  History,
  Save,
  Trash2,
  Copy,
  Check,
  Info,
  ShieldAlert,
  AlertCircle,
  Plus,
  Wand2,
  Play,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button as MaterialDesign3Button } from "@/components/ui/material-design-3-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch as MaterialDesign3Switch } from "@/components/ui/material-design-3-switch";
import type { CustomAction } from "../content/storage";
import {
  loadCustomActions,
  saveCustomAction,
  deleteCustomAction,
} from "../content/storage";
import { ActionIconSelect } from "@/components/action-icon-select";
import { HoneLogo } from "@/components/hone-logo";
import {
  DEFAULT_ACTION_ICON,
  normalizeActionIconName,
  renderActionIcon,
} from "@/lib/action-icons";
import {
  BUILTIN_SHORTCUT_ACTIONS,
  CUSTOM_ACTION_PLACEHOLDERS,
  getActionLabel,
} from "@/lib/shortcuts";

const OPENROUTER_FREE_MODELS = [
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B" },
  { id: "poolside/laguna-xs.2:free", label: "Laguna XS.2" },
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", label: "Nemotron 3 Nano 30B" },
  { id: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B" },
];

const ACTION_PROVIDER_OPTIONS = [
  { value: "__default__", label: "Use global default" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter Free" },
  { value: "openrouter_paid", label: "OpenRouter Paid" },
  { value: "google_ai_studio", label: "Google AI Studio" },
] as const;

interface HistoryItem {
  id: string;
  timestamp: number;
  url: string;
  action: string;
  originalText: string;
  rewrittenText: string;
  provider: string;
  model: string;
}

export default function Options() {
  const [activeTab, setActiveTab] = useState<"api" | "shortcut" | "history" | "actions">(
    "api",
  );
  const [customActions, setCustomActions] = useState<CustomAction[]>([]);
  const [editingAction, setEditingAction] = useState<CustomAction | null>(null);
  const [isNewAction, setIsNewAction] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  // Provider & settings state
  const [activeProvider, setActiveProvider] = useState("openai");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [openaiEndpoint, setOpenaiEndpoint] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-20250514");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.0-flash");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState("");
  const [openrouterPaidKey, setOpenrouterPaidKey] = useState("");
  const [openrouterPaidModel, setOpenrouterPaidModel] = useState("");
  const [googleAiStudioKey, setGoogleAiStudioKey] = useState("");
  const [googleAiStudioModel, setGoogleAiStudioModel] = useState("gemma-3-27b-it");

  // Shortcut states
  const [shortcutKey, setShortcutKey] = useState("");
  const [shortcutCtrl, setShortcutCtrl] = useState(false);
  const [shortcutAlt, setShortcutAlt] = useState(false);
  const [shortcutShift, setShortcutShift] = useState(false);
  const [shortcutMeta, setShortcutMeta] = useState(false);
  const [shortcutAction, setShortcutAction] = useState("fix_spelling");
  const [isRecordingKey, setIsRecordingKey] = useState(false);
  const [dropdownShortcutKey, setDropdownShortcutKey] = useState("d");
  const [dropdownShortcutCtrl, setDropdownShortcutCtrl] = useState(false);
  const [dropdownShortcutAlt, setDropdownShortcutAlt] = useState(true);
  const [dropdownShortcutShift, setDropdownShortcutShift] = useState(true);
  const [dropdownShortcutMeta, setDropdownShortcutMeta] = useState(false);
  const [isRecordingDropdownKey, setIsRecordingDropdownKey] = useState(false);

  // Appearance settings state
  const [hideDot, setHideDot] = useState(false);

  // History & Toast status states

  // History & Toast status states
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Fetch initial settings from local storage
  useEffect(() => {
    chrome.storage.local
      .get([
        "activeProvider",
        "openaiKey",
        "openaiModel",
        "openaiEndpoint",
        "anthropicKey",
        "anthropicModel",
        "geminiKey",
        "geminiModel",
        "openrouterKey",
        "openrouterModel",
        "openrouterPaidKey",
        "openrouterPaidModel",
        "googleAiStudioKey",
        "googleAiStudioModel",
        "shortcutKey",
        "shortcutCtrl",
        "shortcutAlt",
        "shortcutShift",
        "shortcutMeta",
        "shortcutAction",
        "dropdownShortcutKey",
        "dropdownShortcutCtrl",
        "dropdownShortcutAlt",
        "dropdownShortcutShift",
        "dropdownShortcutMeta",
        "hideDot",
        "history",
      ])
      .then((res: any) => {
        if (res.activeProvider) setActiveProvider(res.activeProvider);

        if (res.openaiKey) setOpenaiKey(res.openaiKey);
        if (res.openaiModel) setOpenaiModel(res.openaiModel);
        if (res.openaiEndpoint) setOpenaiEndpoint(res.openaiEndpoint);

        if (res.anthropicKey) setAnthropicKey(res.anthropicKey);
        if (res.anthropicModel) setAnthropicModel(res.anthropicModel);

        if (res.geminiKey) setGeminiKey(res.geminiKey);
        if (res.geminiModel) setGeminiModel(res.geminiModel);

        if (res.openrouterKey) setOpenrouterKey(res.openrouterKey);
        if (res.openrouterModel) setOpenrouterModel(res.openrouterModel);

        if (res.openrouterPaidKey) setOpenrouterPaidKey(res.openrouterPaidKey);
        if (res.openrouterPaidModel)
          setOpenrouterPaidModel(res.openrouterPaidModel);

        if (res.googleAiStudioKey) setGoogleAiStudioKey(res.googleAiStudioKey);
        if (res.googleAiStudioModel)
          setGoogleAiStudioModel(res.googleAiStudioModel);

        if (res.shortcutKey) setShortcutKey(res.shortcutKey);
        setShortcutCtrl(!!res.shortcutCtrl);
        setShortcutAlt(!!res.shortcutAlt);
        setShortcutShift(!!res.shortcutShift);
        setShortcutMeta(!!res.shortcutMeta);
        if (res.shortcutAction) setShortcutAction(res.shortcutAction);

        if (res.dropdownShortcutKey !== undefined)
          setDropdownShortcutKey(res.dropdownShortcutKey);
        setDropdownShortcutCtrl(!!res.dropdownShortcutCtrl);
        setDropdownShortcutAlt(
          res.dropdownShortcutAlt !== undefined
            ? !!res.dropdownShortcutAlt
            : true,
        );
        setDropdownShortcutShift(
          res.dropdownShortcutShift !== undefined
            ? !!res.dropdownShortcutShift
            : true,
        );
        setDropdownShortcutMeta(!!res.dropdownShortcutMeta);

        setHideDot(!!res.hideDot);

        if (res.history) setHistory(res.history);
      });
    loadCustomActions().then(setCustomActions);
  }, []);

  // Show status toasts
  const triggerSaveStatus = (message: string, type: "success" | "error") => {
    setSaveStatus({ message, type });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Save Settings handler
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (activeProvider === "openrouter" && !openrouterKey.trim()) {
      triggerSaveStatus(
        "OpenRouter API Key is required for OpenRouter Free.",
        "error",
      );
      return;
    }

    try {
      await chrome.storage.local.set({
        activeProvider,
        openaiKey,
        openaiModel,
        openaiEndpoint,
        anthropicKey,
        anthropicModel,
        geminiKey,
        geminiModel,
        openrouterKey,
        openrouterModel,
        openrouterPaidKey,
        openrouterPaidModel,
        googleAiStudioKey,
        googleAiStudioModel,
        shortcutKey,
        shortcutCtrl,
        shortcutAlt,
        shortcutShift,
        shortcutMeta,
        shortcutAction,
        dropdownShortcutKey,
        dropdownShortcutCtrl,
        dropdownShortcutAlt,
        dropdownShortcutShift,
        dropdownShortcutMeta,
        hideDot,
      });
      triggerSaveStatus("Settings successfully saved!", "success");
    } catch (err) {
      console.error(err);
      triggerSaveStatus("Failed to save settings.", "error");
    }
  };

  // Handle shortcut recording keypresses
  useEffect(() => {
    if (!isRecordingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      const key = e.key;
      // Filter out pure modifier presses
      if (["Control", "Alt", "Shift", "Meta"].includes(key)) {
        setShortcutCtrl(e.ctrlKey);
        setShortcutAlt(e.altKey);
        setShortcutShift(e.shiftKey);
        setShortcutMeta(e.metaKey);
        return;
      }

      setShortcutCtrl(e.ctrlKey);
      setShortcutAlt(e.altKey);
      setShortcutShift(e.shiftKey);
      setShortcutMeta(e.metaKey);
      setShortcutKey(key);
      setIsRecordingKey(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecordingKey]);

  // Handle dropdown shortcut recording keypresses
  useEffect(() => {
    if (!isRecordingDropdownKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      const key = e.key;
      // Filter out pure modifier presses
      if (["Control", "Alt", "Shift", "Meta"].includes(key)) {
        setDropdownShortcutCtrl(e.ctrlKey);
        setDropdownShortcutAlt(e.altKey);
        setDropdownShortcutShift(e.shiftKey);
        setDropdownShortcutMeta(e.metaKey);
        return;
      }

      setDropdownShortcutCtrl(e.ctrlKey);
      setDropdownShortcutAlt(e.altKey);
      setDropdownShortcutShift(e.shiftKey);
      setDropdownShortcutMeta(e.metaKey);
      setDropdownShortcutKey(key);
      setIsRecordingDropdownKey(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecordingDropdownKey]);

  // Clean format helper for shortcut display
  const getShortcutDisplay = () => {
    const keys = [];
    if (shortcutCtrl) keys.push("Ctrl");
    if (shortcutAlt) keys.push("Alt");
    if (shortcutShift) keys.push("Shift");
    if (shortcutMeta) keys.push("⌘");
    if (shortcutKey) keys.push(shortcutKey.toUpperCase());

    return keys.length > 0 ? keys.join(" + ") : "None configured";
  };

  const getDropdownShortcutDisplay = () => {
    const keys = [];
    if (dropdownShortcutCtrl) keys.push("Ctrl");
    if (dropdownShortcutAlt) keys.push("Alt");
    if (dropdownShortcutShift) keys.push("Shift");
    if (dropdownShortcutMeta) keys.push("⌘");
    if (dropdownShortcutKey) keys.push(dropdownShortcutKey.toUpperCase());

    return keys.length > 0 ? keys.join(" + ") : "None configured";
  };

  // History action copy helper
  const handleCopyHistory = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Clear single history entry
  const handleDeleteHistory = async (id: string) => {
    const updatedHistory = history.filter((item) => item.id !== id);
    setHistory(updatedHistory);
    await chrome.storage.local.set({ history: updatedHistory });
    triggerSaveStatus("History item deleted.", "success");
  };

  // Clear all history logs
  const handleClearAllHistory = async () => {
    if (
      window.confirm(
        "Are you sure you want to clear your entire transformation history? This cannot be undone.",
      )
    ) {
      setHistory([]);
      await chrome.storage.local.set({ history: [] });
      triggerSaveStatus("All history cleared.", "success");
    }
  };

  const getActionName = (actionCode: string) =>
    getActionLabel(actionCode, customActions);

  const isKnownShortcutAction = (id: string) =>
    BUILTIN_SHORTCUT_ACTIONS.some((a) => a.id === id) ||
    customActions.some((a) => a.id === id);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 antialiased select-none">
      {/* Header Panel */}
      <div className="flex items-center gap-4 mb-8 border border-border bg-card p-6 rounded-xl shadow-sm">
        <div className="w-12 h-12 bg-white/5 border border-border rounded-lg flex items-center justify-center p-1.5">
          <HoneLogo size={36} alt="" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground m-0">
            Hone
          </h1>
          <p className="text-muted-foreground text-xs mt-1">
            Configure providers, models, shortcuts, and custom actions for Hone.
          </p>
        </div>
      </div>

      {/* Main configuration dashboard */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as any)}
        orientation="vertical"
        className="grid grid-cols-1 md:grid-cols-4 gap-8"
      >
        {/* Sidebar Nav */}
        <div className="md:col-span-1">
          <TabsList className="flex flex-col w-full bg-card border border-border p-1 h-fit gap-1 rounded-xl">
            <TabsTrigger
              value="api"
              className="flex items-center gap-3 justify-start px-4 py-3 rounded-lg text-xs font-medium cursor-pointer transition-all w-full"
            >
              <Key className="w-4 h-4 text-muted-foreground group-data-active:text-foreground" />
              API Providers
            </TabsTrigger>

            <TabsTrigger
              value="shortcut"
              className="flex items-center gap-3 justify-start px-4 py-3 rounded-lg text-xs font-medium cursor-pointer transition-all w-full"
            >
              <Keyboard className="w-4 h-4 text-muted-foreground group-data-active:text-foreground" />
              Key Bindings
            </TabsTrigger>

            <TabsTrigger
              value="history"
              className="flex items-center gap-3 justify-start px-4 py-3 rounded-lg text-xs font-medium cursor-pointer transition-all w-full"
            >
              <History className="w-4 h-4 text-muted-foreground group-data-active:text-foreground" />
              Rewrite History
            </TabsTrigger>

            <TabsTrigger
              value="actions"
              className="flex items-center gap-3 justify-start px-4 py-3 rounded-lg text-xs font-medium cursor-pointer transition-all w-full"
            >
              <Wand2 className="w-4 h-4 text-muted-foreground group-data-active:text-foreground" />
              Actions Studio
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          {/* TAB 1: API Setup */}
          <TabsContent value="api" className="m-0 focus-visible:outline-none">
            <Card className="border border-border bg-card shadow-sm rounded-xl">
              <CardHeader className="border-b border-border/60 pb-5">
                <CardTitle className="text-base font-semibold text-foreground">
                  Active AI Provider
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Select the default AI provider to handle all of your web input
                  transformations.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-6 flex flex-col gap-6">
                <form onSubmit={handleSave} className="flex flex-col gap-6">
                  {/* Cards for active provider selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      {
                        id: "openrouter",
                        label: "OpenRouter Free",
                        desc: "Auto-cycling free models",
                      },
                      {
                        id: "openrouter_paid",
                        label: "OpenRouter Paid",
                        desc: "Custom model identifier",
                      },
                      {
                        id: "openai",
                        label: "OpenAI Capable",
                        desc: "GPT-4o, Custom Endpoints",
                      },
                      {
                        id: "anthropic",
                        label: "Anthropic Claude",
                        desc: "Claude 3.5 Sonnet",
                      },
                      {
                        id: "gemini",
                        label: "Google Gemini",
                        desc: "Gemini 1.5 Flash",
                      },
                      {
                        id: "google_ai_studio",
                        label: "Google AI Studio",
                        desc: "Gemma via GenAI SDK",
                      },
                    ].map((prov) => (
                      <button
                        key={prov.id}
                        type="button"
                        onClick={() => setActiveProvider(prov.id)}
                        className={`flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/20
                          ${
                            activeProvider === prov.id
                              ? "bg-foreground/5 border-foreground text-foreground shadow-sm"
                              : "bg-card border-border/80 text-muted-foreground hover:bg-foreground/[0.02] hover:text-foreground"
                          }`}
                      >
                        <span
                          className={`font-semibold text-xs transition-colors ${activeProvider === prov.id ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {prov.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/80 leading-normal">
                          {prov.desc}
                        </span>
                      </button>
                    ))}
                  </div>

                  <Separator className="bg-border/60" />

                  {/* Provider Config Fields */}
                  {activeProvider === "openrouter" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                          OpenRouter Free
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-[9px] font-mono border-border"
                        >
                          Auto-Cycling Fallback
                        </Badge>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-lg p-4 flex gap-3 text-xs text-muted-foreground leading-relaxed">
                        <Info className="w-5 h-5 shrink-0 text-foreground/60 mt-0.5" />
                        <div>
                          A free OpenRouter API key is required (create one at{" "}
                          <strong>openrouter.ai</strong>). Select your{" "}
                          <strong>preferred starting model</strong>; if it fails,
                          the extension tries all other free models — cycling
                          through the full list up to <strong>3 times</strong>{" "}
                          before giving up.
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          OpenRouter API Key
                        </Label>
                        <Input
                          type="password"
                          placeholder="sk-or-v1-..."
                          value={openrouterKey}
                          onChange={(e) => setOpenrouterKey(e.target.value)}
                          required={activeProvider === "openrouter"}
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Preferred Starting Model
                        </Label>
                        <Select
                          value={openrouterModel}
                          onValueChange={(val) => setOpenrouterModel(val)}
                        >
                          <SelectTrigger className="bg-background border border-border/80 rounded-lg text-xs h-9 justify-between w-full">
                            <SelectValue placeholder="Select starting model..." />
                          </SelectTrigger>
                          <SelectContent className="bg-card border border-border rounded-lg shadow-md">
                            {OPENROUTER_FREE_MODELS.map((m) => (
                              <SelectItem
                                key={m.id}
                                value={m.id}
                                className="text-xs"
                              >
                                <span className="font-medium">{m.label}</span>
                                <span className="ml-2 text-muted-foreground/60 font-mono text-[10px]">
                                  {m.id}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground/60 leading-normal">
                          On error, all 5 models are tried in sequence, repeated
                          3 times (15 total attempts).
                        </p>
                      </div>
                    </div>
                  )}

                  {activeProvider === "openrouter_paid" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                          OpenRouter Paid
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-[9px] font-mono border-border"
                        >
                          Custom Model
                        </Badge>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-lg p-4 flex gap-3 text-xs text-muted-foreground leading-relaxed">
                        <Info className="w-5 h-5 shrink-0 text-foreground/60 mt-0.5" />
                        <div>
                          Enter any model identifier available on{" "}
                          <strong>openrouter.ai</strong> — paid or otherwise.
                          Your API key must have sufficient credits for the
                          chosen model.
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          OpenRouter API Key
                        </Label>
                        <Input
                          type="password"
                          placeholder="sk-or-v1-..."
                          value={openrouterPaidKey}
                          onChange={(e) => setOpenrouterPaidKey(e.target.value)}
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Model Identifier
                        </Label>
                        <Input
                          type="text"
                          placeholder="e.g. anthropic/claude-3.5-sonnet, openai/gpt-4o"
                          value={openrouterPaidModel}
                          onChange={(e) =>
                            setOpenrouterPaidModel(e.target.value)
                          }
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/40 h-9 font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground/60 leading-normal">
                          Use any model slug from openrouter.ai/models — e.g.{" "}
                          <span className="font-mono">openai/gpt-4o</span> or{" "}
                          <span className="font-mono">
                            google/gemini-2.5-pro
                          </span>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  {activeProvider === "openai" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                          OpenAI Custom Settings
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-[9px] font-mono border-border"
                        >
                          Custom Endpoint
                        </Badge>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          OpenAI Capable API Key
                        </Label>
                        <Input
                          type="password"
                          placeholder="sk-proj-..."
                          value={openaiKey}
                          onChange={(e) => setOpenaiKey(e.target.value)}
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground font-medium">
                            Model Name
                          </Label>
                          <Input
                            type="text"
                            value={openaiModel}
                            onChange={(e) => setOpenaiModel(e.target.value)}
                            placeholder="gpt-4o-mini"
                            className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground font-medium">
                            Custom Target API Endpoint
                          </Label>
                          <Input
                            type="text"
                            value={openaiEndpoint}
                            onChange={(e) => setOpenaiEndpoint(e.target.value)}
                            className="bg-background border border-border/80 rounded-lg text-xs h-9"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeProvider === "anthropic" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                        Anthropic Claude Settings
                      </h3>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Anthropic API Key
                        </Label>
                        <Input
                          type="password"
                          placeholder="sk-ant-..."
                          value={anthropicKey}
                          onChange={(e) => setAnthropicKey(e.target.value)}
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Model Name
                        </Label>
                        <Input
                          type="text"
                          value={anthropicModel}
                          onChange={(e) => setAnthropicModel(e.target.value)}
                          className="bg-background border border-border/80 rounded-lg text-xs h-9"
                        />
                      </div>
                    </div>
                  )}

                  {activeProvider === "gemini" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                        Google Gemini Settings
                      </h3>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Gemini API Key
                        </Label>
                        <Input
                          type="password"
                          placeholder="AIzaSy..."
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Model Name
                        </Label>
                        <Select
                          value={geminiModel}
                          onValueChange={(val) => setGeminiModel(val)}
                        >
                          <SelectTrigger className="bg-background border border-border/80 rounded-lg text-xs h-9 justify-between">
                            <SelectValue placeholder="Select model..." />
                          </SelectTrigger>
                          <SelectContent className="bg-card border border-border rounded-lg shadow-md">
                            <SelectItem
                              value="gemini-1.5-flash"
                              className="text-xs"
                            >
                              gemini-1.5-flash
                            </SelectItem>
                            <SelectItem
                              value="gemini-1.5-pro"
                              className="text-xs"
                            >
                              gemini-1.5-pro
                            </SelectItem>
                            <SelectItem
                              value="gemini-2.5-flash"
                              className="text-xs"
                            >
                              gemini-2.5-flash
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {activeProvider === "google_ai_studio" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                          Google AI Studio (GenAI SDK)
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-[9px] font-mono border-border"
                        >
                          Thinking (MINIMAL)
                        </Badge>
                      </div>

                      <div className="bg-foreground/[0.02] border border-border rounded-lg p-4 flex gap-3 text-xs text-muted-foreground leading-relaxed">
                        <Info className="w-5 h-5 shrink-0 text-foreground/60 mt-0.5" />
                        <div>
                          Uses <strong>@google/genai</strong> SDK with thinking
                          config (MINIMAL). Get a free API key from{" "}
                          <strong>aistudio.google.com</strong> — generous free
                          tier. Supports Gemma models like{" "}
                          <span className="font-mono">gemma-4-26b-a4b-it</span>.
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Google AI Studio API Key
                        </Label>
                        <Input
                          type="password"
                          placeholder="AIzaSy..."
                          value={googleAiStudioKey}
                          onChange={(e) => setGoogleAiStudioKey(e.target.value)}
                          className="bg-background border border-border/80 rounded-lg text-xs placeholder:text-muted-foreground/50 h-9"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground font-medium">
                          Model Name
                        </Label>
                        <Input
                          type="text"
                          value={googleAiStudioModel}
                          onChange={(e) =>
                            setGoogleAiStudioModel(e.target.value)
                          }
                          placeholder="gemma-4-26b-a4b-it"
                          className="bg-background border border-border/80 rounded-lg text-xs h-9 font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground/60 leading-normal">
                          Supports any model accessible via the Gemini API —
                          e.g.{" "}
                          <span className="font-mono">gemma-4-26b-a4b-it</span>,{" "}
                          <span className="font-mono">gemini-2.5-flash</span>,
                          etc.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <MaterialDesign3Button
                      variant="default"
                      size="default"
                      shape="round"
                      type="submit"
                    >
                      <Save className="w-4 h-4" />
                      Save API Keys
                    </MaterialDesign3Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Keyboard Shortcuts */}
          <TabsContent
            value="shortcut"
            className="m-0 focus-visible:outline-none"
          >
            <Card className="border border-border bg-card shadow-sm rounded-xl">
              <CardHeader className="border-b border-border/60 pb-5">
                <CardTitle className="text-base font-semibold text-foreground">
                  Custom Keyboard Shortcuts
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Configure a fast shortcut to execute an AI task on your
                  selected text inside focused webpage input fields.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-6">
                <form onSubmit={handleSave} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground font-medium">
                      Key Combination
                    </Label>

                    <div className="flex gap-3 items-center">
                      <div className="bg-background border border-border/80 rounded-lg px-4 py-4 text-xs text-center flex-1 font-mono font-bold text-foreground flex items-center justify-center gap-2 select-none min-h-[56px]">
                        {isRecordingKey ? (
                          <span className="animate-pulse text-foreground flex items-center gap-2">
                            <span className="w-2 h-2 bg-foreground rounded-full animate-ping" />
                            Listening to keypresses...
                          </span>
                        ) : (
                          getShortcutDisplay()
                        )}
                      </div>

                      <MaterialDesign3Button
                        variant="default"
                        size="default"
                        shape="round"
                        type="button"
                        onClick={() => {
                          setShortcutKey("");
                          setShortcutCtrl(false);
                          setShortcutAlt(false);
                          setShortcutShift(false);
                          setShortcutMeta(false);
                          setIsRecordingKey(true);
                        }}
                      >
                        Record Combination
                      </MaterialDesign3Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground font-medium">
                      Shortcut Action Trigger
                    </Label>
                    <Select
                      value={shortcutAction}
                      onValueChange={(val) => setShortcutAction(val)}
                    >
                      <SelectTrigger className="bg-background border border-border/80 rounded-lg text-xs h-9 justify-between">
                        <SelectValue placeholder="Select shortcut action..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border rounded-lg shadow-md max-h-72">
                        <SelectGroup>
                          <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
                            Built-in actions
                          </SelectLabel>
                          {BUILTIN_SHORTCUT_ACTIONS.map((action) => (
                            <SelectItem
                              key={action.id}
                              value={action.id}
                              className="text-xs"
                            >
                              {action.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {customActions.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
                              Custom actions
                            </SelectLabel>
                            {customActions.map((action) => (
                              <SelectItem
                                key={action.id}
                                value={action.id}
                                className="text-xs"
                              >
                                {action.name || "Untitled action"}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {shortcutAction &&
                          !isKnownShortcutAction(shortcutAction) && (
                            <SelectGroup>
                              <SelectItem
                                value={shortcutAction}
                                className="text-xs text-muted-foreground"
                              >
                                {getActionName(shortcutAction)} (unavailable)
                              </SelectItem>
                            </SelectGroup>
                          )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-foreground/[0.02] border border-border rounded-lg p-4 flex gap-3 text-xs text-muted-foreground leading-normal mt-1">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-foreground/60 mt-0.5" />
                    <div>
                      <strong>Pro Tip:</strong> Pressing this combination while
                      focusing on any input or textarea on any webpage will
                      extract the selected text (or all text if nothing is
                      selected) and replace it with the corrected version from
                      your active AI provider.
                    </div>
                  </div>

                  <Separator className="bg-border/60 my-4" />

                  {/* Dropdown Menu Toggle Shortcut */}
                  <div className="flex flex-col gap-4">
                    <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                      AI Rewrite Dropdown Shortcut
                    </h3>

                    <div className="flex flex-col gap-2">
                      <Label className="text-xs text-muted-foreground font-medium">
                        Dropdown Toggle Key Combination
                      </Label>

                      <div className="flex gap-3 items-center">
                        <div className="bg-background border border-border/80 rounded-lg px-4 py-4 text-xs text-center flex-1 font-mono font-bold text-foreground flex items-center justify-center gap-2 select-none min-h-[56px]">
                          {isRecordingDropdownKey ? (
                            <span className="animate-pulse text-foreground flex items-center gap-2">
                              <span className="w-2 h-2 bg-foreground rounded-full animate-ping" />
                              Listening to keypresses...
                            </span>
                          ) : (
                            getDropdownShortcutDisplay()
                          )}
                        </div>

                        <MaterialDesign3Button
                          variant="default"
                          size="default"
                          shape="round"
                          type="button"
                          onClick={() => {
                            setDropdownShortcutKey("");
                            setDropdownShortcutCtrl(false);
                            setDropdownShortcutAlt(false);
                            setDropdownShortcutShift(false);
                            setDropdownShortcutMeta(false);
                            setIsRecordingDropdownKey(true);
                          }}
                        >
                          Record Combination
                        </MaterialDesign3Button>
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-border/60 my-4" />

                  {/* Appearance / Overlay settings */}
                  <div className="flex flex-col gap-4">
                    <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                      Overlay Visibility Settings
                    </h3>

                    <div className="flex items-center justify-between border border-border/80 bg-background/50 rounded-xl p-4.5">
                      <div className="flex flex-col gap-1 pr-4">
                        <Label className="text-xs font-semibold text-foreground">
                          Hide Sparkle Trigger Dot
                        </Label>
                        <span className="text-[11px] text-muted-foreground leading-normal">
                          Completely hide the purple sparkle float button from
                          webpage inputs. You will still be able to open the
                          dropdown menu anytime by focusing an input and
                          pressing your dropdown shortcut.
                        </span>
                      </div>
                      <MaterialDesign3Switch
                        variant="primary"
                        size="default"
                        checked={hideDot}
                        onCheckedChange={(checked) => setHideDot(checked)}
                        haptic="none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <MaterialDesign3Button
                      variant="default"
                      size="default"
                      shape="round"
                      type="submit"
                    >
                      <Save className="w-4 h-4" />
                      Save Shortcuts
                    </MaterialDesign3Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: History Viewer */}
          <TabsContent
            value="history"
            className="m-0 focus-visible:outline-none"
          >
            <Card className="border border-border bg-card shadow-sm rounded-xl">
              <CardHeader className="border-b border-border/60 pb-5">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">
                      Rewrite History logs
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Review past Hone transformations, text
                      replacements, and copies.
                    </CardDescription>
                  </div>
                  {history.length > 0 && (
                    <MaterialDesign3Button
                      variant="outline"
                      size="sm"
                      shape="square"
                      onClick={handleClearAllHistory}
                      className="hover:text-red-500 hover:border-red-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </MaterialDesign3Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {history.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-border rounded-xl flex flex-col items-center gap-2.5 bg-foreground/[0.01]">
                    <History className="w-8 h-8 text-muted-foreground/60" />
                    <p className="text-muted-foreground text-xs font-medium">
                      No transformations recorded yet.
                    </p>
                    <p className="text-muted-foreground/60 text-[10px]">
                      Start using Hone in webpage text boxes to
                      build history.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 overflow-y-auto max-h-[520px] pr-1">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="bg-background border border-border/80 rounded-xl p-4 flex flex-col gap-3 transition-colors hover:border-border"
                      >
                        {/* Meta Information */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <Badge
                              variant="secondary"
                              className="text-[9px] font-mono border-border"
                            >
                              {getActionName(item.action)}
                            </Badge>
                            <span className="px-2 py-0.5 rounded border border-border text-muted-foreground text-[9px] font-mono bg-card">
                              {item.provider} • {item.model}
                            </span>
                            <span className="text-muted-foreground/80 font-medium">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <MaterialDesign3Button
                              variant="ghost"
                              size="icon-sm"
                              shape="square"
                              onClick={() =>
                                handleCopyHistory(item.rewrittenText, item.id)
                              }
                              className="text-muted-foreground hover:text-foreground w-7 h-7"
                              title="Copy result"
                            >
                              {copiedId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </MaterialDesign3Button>
                            <MaterialDesign3Button
                              variant="ghost"
                              size="icon-sm"
                              shape="square"
                              onClick={() => handleDeleteHistory(item.id)}
                              className="text-muted-foreground hover:text-red-500 w-7 h-7"
                              title="Delete entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </MaterialDesign3Button>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground truncate w-full flex items-center gap-1 select-none font-mono">
                          <span>URL:</span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground hover:underline truncate"
                          >
                            {item.url}
                          </a>
                        </div>

                        {/* Text Comparison Panel */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-1">
                          <div className="flex flex-col gap-1.5 bg-card p-3 rounded-lg border border-border/50">
                            <span className="text-[9px] text-muted-foreground uppercase font-semibold select-none">
                              Original text
                            </span>
                            <div className="text-muted-foreground text-xs max-h-[80px] overflow-y-auto whitespace-pre-wrap leading-normal font-sans pr-1">
                              {item.originalText}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 bg-card p-3 rounded-lg border border-border/50">
                            <span className="text-[9px] text-foreground uppercase font-semibold select-none">
                              Rewritten text
                            </span>
                            <div className="text-foreground text-xs max-h-[80px] overflow-y-auto whitespace-pre-wrap leading-normal font-sans pr-1">
                              {item.rewrittenText}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Actions Studio */}
          <TabsContent
            value="actions"
            className="m-0 focus-visible:outline-none"
          >
            <Card className="border border-border bg-card shadow-sm rounded-xl">
              <CardHeader className="border-b border-border/60 pb-5">
                <CardTitle className="text-base font-semibold text-foreground">
                  Actions Studio
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Create custom AI transformation actions with your own prompt
                  templates.
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-6">
                <div className="flex gap-6">
                  {/* Left: action list */}
                  <div className="w-56 shrink-0 flex flex-col gap-2">
                    <MaterialDesign3Button
                      variant="default"
                      size="sm"
                      shape="round"
                      onClick={() => {
                        setEditingAction({
                          id: crypto.randomUUID(),
                          name: "",
                          description: "",
                          promptTemplate: "",
                          systemPrompt: "",
                          icon: DEFAULT_ACTION_ICON,
                          color: "#8B5CF6",
                          category: "custom",
                          replaceMode: "replace",
                          enabled: true,
                          createdAt: Date.now(),
                        });
                        setIsNewAction(true);
                      }}
                      className="w-full"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Action
                    </MaterialDesign3Button>

                    <div className="flex flex-col gap-1">
                      {customActions.map((ca) => (
                        <Button
                          key={ca.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingAction(ca);
                            setIsNewAction(false);
                          }}
                          className={`h-auto w-full justify-start gap-2 px-3 py-2 text-xs font-medium ${
                            editingAction?.id === ca.id
                              ? "bg-foreground/5 text-foreground border border-foreground/20 hover:bg-foreground/5"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {renderActionIcon(ca.icon, {
                            size: 14,
                            color: ca.color || "#8B5CF6",
                          })}
                          <span className="truncate flex-1 text-left">
                            {ca.name || "Untitled"}
                          </span>
                        </Button>
                      ))}
                    </div>

                    {customActions.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 text-center py-8">
                        No custom actions yet.
                        <br />
                        Create one to get started.
                      </p>
                    )}
                  </div>

                  {/* Right: editor */}
                  <div className="flex-1 min-w-0">
                    {!editingAction ? (
                      <div className="text-center py-16 border border-dashed border-border rounded-xl flex flex-col items-center gap-2 bg-foreground/[0.01]">
                        <Wand2 className="w-8 h-8 text-muted-foreground/60" />
                        <p className="text-muted-foreground text-xs font-medium">
                          Select an action or create a new one
                        </p>
                      </div>
                    ) : (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!editingAction) return;
                          await saveCustomAction({
                            ...editingAction,
                            icon: normalizeActionIconName(editingAction.icon),
                            color: editingAction.color || "#8B5CF6",
                          });
                          const updated = await loadCustomActions();
                          setCustomActions(updated);
                          setIsNewAction(false);
                          triggerSaveStatus(
                            "Action saved successfully!",
                            "success",
                          );
                        }}
                        className="flex flex-col gap-4"
                      >
                        {/* Name */}
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground font-medium">
                            Action Name
                          </Label>
                          <Input
                            type="text"
                            placeholder={CUSTOM_ACTION_PLACEHOLDERS.name}
                            value={editingAction.name}
                            onChange={(e) =>
                              setEditingAction({
                                ...editingAction,
                                name: e.target.value,
                              })
                            }
                            className="bg-background border border-border/80 rounded-lg text-xs h-9"
                            required
                          />
                        </div>

                        {/* Description */}
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground font-medium">
                            Description{" "}
                            <span className="text-muted-foreground/50">
                              (Optional)
                            </span>
                          </Label>
                          <Input
                            type="text"
                            placeholder={CUSTOM_ACTION_PLACEHOLDERS.description}
                            value={editingAction.description || ""}
                            onChange={(e) =>
                              setEditingAction({
                                ...editingAction,
                                description: e.target.value,
                              })
                            }
                            className="bg-background border border-border/80 rounded-lg text-xs h-9"
                          />
                        </div>

                        {/* Icon + Color */}
                        {(() => {
                          const accentColor =
                            editingAction.color || "#8B5CF6";
                          const selectedIcon =
                            editingAction.icon || DEFAULT_ACTION_ICON;

                          return (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-2">
                                <Label className="text-xs text-muted-foreground font-medium">
                                  Icon
                                </Label>
                                <ActionIconSelect
                                  value={editingAction.icon}
                                  accentColor={accentColor}
                                  onValueChange={(icon) =>
                                    setEditingAction({
                                      ...editingAction,
                                      icon,
                                    })
                                  }
                                />
                              </div>

                              <div className="flex flex-col gap-2">
                                <Label className="text-xs text-muted-foreground font-medium">
                                  Color
                                </Label>
                                <div className="flex flex-wrap gap-2 items-center">
                                  {[
                                    "#8B5CF6",
                                    "#3B82F6",
                                    "#10B981",
                                    "#F59E0B",
                                    "#EF4444",
                                    "#EC4899",
                                    "#06B6D4",
                                    "#84CC16",
                                  ].map((c) => (
                                    <Button
                                      key={c}
                                      type="button"
                                      variant="outline"
                                      size="icon-sm"
                                      onClick={() =>
                                        setEditingAction({
                                          ...editingAction,
                                          color: c,
                                        })
                                      }
                                      className={`h-7 w-7 rounded-full border-2 p-0 ${
                                        editingAction.color === c
                                          ? "border-foreground scale-110"
                                          : "border-transparent"
                                      }`}
                                      style={{ background: c }}
                                      aria-label={`Color ${c}`}
                                    />
                                  ))}
                                  <span className="ml-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    Preview
                                    {renderActionIcon(selectedIcon, {
                                      size: 14,
                                      color: accentColor,
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Prompt Template */}
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground font-medium">
                            Prompt Template
                          </Label>
                          <Textarea
                            placeholder={CUSTOM_ACTION_PLACEHOLDERS.promptTemplate}
                            value={editingAction.promptTemplate}
                            onChange={(e) =>
                              setEditingAction({
                                ...editingAction,
                                promptTemplate: e.target.value,
                              })
                            }
                            className="min-h-[120px] resize-y font-mono text-xs"
                            required
                          />
                          <p className="text-[10px] text-muted-foreground/60">
                            Use{" "}
                            <code className="text-foreground/70">
                              {"{{input}}"}
                            </code>{" "}
                            as a placeholder for the text being transformed.
                          </p>
                        </div>

                        {/* System Prompt */}
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs text-muted-foreground font-medium">
                            System Prompt{" "}
                            <span className="text-muted-foreground/50">
                              (Optional)
                            </span>
                          </Label>
                          <Textarea
                            placeholder={CUSTOM_ACTION_PLACEHOLDERS.systemPrompt}
                            value={editingAction.systemPrompt || ""}
                            onChange={(e) =>
                              setEditingAction({
                                ...editingAction,
                                systemPrompt: e.target.value,
                              })
                            }
                            className="min-h-[60px] resize-y font-mono text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground/60">
                            Sets the assistant role/behavior. Supported by
                            OpenAI, Anthropic, Gemini.
                          </p>
                        </div>

                        {/* Options grid */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-medium">
                              Provider{" "}
                              <span className="text-muted-foreground/50">
                                (Optional)
                              </span>
                            </Label>
                            <Select
                              value={editingAction.provider || "__default__"}
                              onValueChange={(val) =>
                                setEditingAction({
                                  ...editingAction,
                                  provider:
                                    val === "__default__" ? undefined : val,
                                })
                              }
                            >
                              <SelectTrigger className="h-9 w-full justify-between rounded-lg border-border/80 bg-background text-xs">
                                <SelectValue placeholder="Use global default" />
                              </SelectTrigger>
                              <SelectContent className="rounded-lg border border-border bg-card shadow-md">
                                {ACTION_PROVIDER_OPTIONS.map((opt) => (
                                  <SelectItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                  >
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-medium">
                              Model{" "}
                              <span className="text-muted-foreground/50">
                                (Optional)
                              </span>
                            </Label>
                            <Input
                              type="text"
                              placeholder="gpt-4o-mini"
                              value={editingAction.model || ""}
                              onChange={(e) =>
                                setEditingAction({
                                  ...editingAction,
                                  model: e.target.value || undefined,
                                })
                              }
                              className="bg-background border border-border/80 rounded-lg text-xs h-9"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-muted-foreground font-medium">
                              Temperature{" "}
                              <span className="text-muted-foreground/50">
                                (Optional)
                              </span>
                            </Label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="2"
                              placeholder="0.7"
                              value={editingAction.temperature ?? ""}
                              onChange={(e) =>
                                setEditingAction({
                                  ...editingAction,
                                  temperature: e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined,
                                })
                              }
                              className="bg-background border border-border/80 rounded-lg text-xs h-9"
                            />
                          </div>
                        </div>

                        {/* Replace mode */}
                        <div className="flex items-center justify-between border border-border/80 bg-background/50 rounded-xl p-4">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs font-semibold text-foreground">
                              Preview before replacing
                            </Label>
                            <span className="text-[10px] text-muted-foreground">
                              Show result in a preview panel instead of
                              replacing inline immediately.
                            </span>
                          </div>
                          <MaterialDesign3Switch
                            variant="primary"
                            size="default"
                            checked={editingAction.replaceMode === "preview"}
                            onCheckedChange={(checked) =>
                              setEditingAction({
                                ...editingAction,
                                replaceMode: checked ? "preview" : "replace",
                              })
                            }
                            haptic="none"
                          />
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 justify-end pt-2">
                          {!isNewAction && (
                            <MaterialDesign3Button
                              variant="outline"
                              size="sm"
                              shape="round"
                              type="button"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Delete "${editingAction.name}"? This cannot be undone.`,
                                  )
                                )
                                  return;
                                await deleteCustomAction(editingAction.id);
                                const updated = await loadCustomActions();
                                setCustomActions(updated);
                                setEditingAction(null);
                                triggerSaveStatus(
                                  "Action deleted.",
                                  "success",
                                );
                              }}
                              className="text-red-400 hover:text-red-300 hover:border-red-500/30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </MaterialDesign3Button>
                          )}
                          <MaterialDesign3Button
                            variant="default"
                            size="sm"
                            shape="round"
                            type="submit"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Save Action
                          </MaterialDesign3Button>
                        </div>

                        {/* Test Playground */}
                        {editingAction.promptTemplate && (
                          <>
                            <Separator className="bg-border/60 my-2" />
                            <div className="flex flex-col gap-3">
                              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                Test Playground
                              </h4>
                              <div className="flex flex-col gap-2">
                                <Textarea
                                  placeholder={CUSTOM_ACTION_PLACEHOLDERS.testInput}
                                  value={testInput}
                                  onChange={(e) => setTestInput(e.target.value)}
                                  className="min-h-[60px] resize-y font-mono text-xs"
                                />
                                <div className="flex gap-2">
                                  <MaterialDesign3Button
                                    variant="default"
                                    size="sm"
                                    shape="round"
                                    type="button"
                                    disabled={!testInput.trim() || testLoading}
                                    onClick={async () => {
                                      setTestLoading(true);
                                      setTestResult("");
                                      try {
                                        const response = await chrome.runtime.sendMessage(
                                          {
                                            type: "PROCESS_TEXT",
                                            action: editingAction.id,
                                            text: testInput,
                                          },
                                        );
                                        if (
                                          response?.success &&
                                          response.text
                                        ) {
                                          setTestResult(response.text);
                                        } else {
                                          setTestResult(
                                            `Error: ${response?.error || "Unknown error"}`,
                                          );
                                        }
                                      } catch (err: any) {
                                        setTestResult(
                                          `Error: ${err.message}`,
                                        );
                                      }
                                      setTestLoading(false);
                                    }}
                                  >
                                    {testLoading ? (
                                      <span className="animate-pulse">
                                        Running...
                                      </span>
                                    ) : (
                                      <>
                                        <Play className="w-3 h-3" />
                                        Run Test
                                      </>
                                    )}
                                  </MaterialDesign3Button>
                                </div>
                              </div>
                              {testResult && (
                                <Textarea
                                  readOnly
                                  value={testResult}
                                  className="max-h-[200px] min-h-[80px] resize-none font-mono text-xs leading-relaxed"
                                />
                              )}
                            </div>
                          </>
                        )}
                      </form>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Sleek Scoped Global Toast */}
      {saveStatus && (
        <div
          className={`fixed bottom-6 right-6 flex items-center gap-2.5 px-4.5 py-3 rounded-lg text-xs shadow-lg border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 z-50 bg-card
            ${
              saveStatus.type === "success"
                ? "border-border text-foreground"
                : "border-red-500/20 text-red-400"
            }`}
        >
          {saveStatus.type === "success" ? (
            <Check className="w-4 h-4 text-foreground" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
          <span className="font-medium">{saveStatus.message}</span>
        </div>
      )}
    </div>
  );
}
