import { useState, useEffect } from "react";
import { Settings, Sliders, Keyboard, ListTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button as MaterialDesign3Button } from "@/components/ui/material-design-3-button";
import { Switch as MaterialDesign3Switch } from "@/components/ui/material-design-3-switch";
import { HoneLogo } from "@/components/hone-logo";
import { formatShortcutCombo, getActionLabel } from "@/lib/shortcuts";
import { loadCustomActions } from "../content/storage";

interface ManifestCommand {
  name: string;
  description: string;
  shortcut: string;
}

function ShortcutRow({
  label,
  combo,
  description,
  configured = true,
}: {
  label: string;
  combo: string | null;
  description: string;
  configured?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-foreground/[0.02] px-2 py-1.5">
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[9px] font-semibold text-foreground leading-tight">
          {label}
        </span>
        {combo ? (
          <Badge
            variant="secondary"
            className="shrink-0 font-mono text-[8px] border-border/60 py-0 px-1"
          >
            {combo}
          </Badge>
        ) : (
          <span className="text-[8px] text-muted-foreground/70 shrink-0">
            {configured ? "Not set" : "—"}
          </span>
        )}
      </div>
      <p className="text-[8px] text-muted-foreground leading-snug">{description}</p>
    </div>
  );
}

export default function Popup() {
  const [provider, setProvider] = useState("openrouter");
  const [model, setModel] = useState("google/gemma-2-9b-it:free");
  const [hideDot, setHideDot] = useState(false);
  const [menuShortcut, setMenuShortcut] = useState<string | null>(null);
  const [quickShortcut, setQuickShortcut] = useState<string | null>(null);
  const [quickActionLabel, setQuickActionLabel] = useState<string | null>(null);
  const [manifestCommands, setManifestCommands] = useState<ManifestCommand[]>(
    [],
  );

  useEffect(() => {
    chrome.storage.local.get(
      [
        "activeProvider",
        "openaiModel",
        "anthropicModel",
        "geminiModel",
        "openrouterModel",
        "openrouterPaidModel",
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
      ],
      async (res: Record<string, unknown>) => {
        const active = (res.activeProvider as string) || "openrouter";
        setProvider(active);

        if (active === "openai")
          setModel((res.openaiModel as string) || "gpt-4o-mini");
        else if (active === "anthropic")
          setModel(
            (res.anthropicModel as string) || "claude-3-5-sonnet-20241022",
          );
        else if (active === "gemini")
          setModel((res.geminiModel as string) || "gemini-1.5-flash");
        else if (active === "openrouter_paid")
          setModel((res.openrouterPaidModel as string) || "custom model");
        else if (active === "google_ai_studio")
          setModel(
            (res.googleAiStudioModel as string) || "gemma-4-26b-a4b-it",
          );
        else
          setModel(
            (res.openrouterModel as string) || "google/gemma-4-26b-a4b-it:free",
          );

        setMenuShortcut(
          formatShortcutCombo({
            key: (res.dropdownShortcutKey as string) || "d",
            ctrl: !!res.dropdownShortcutCtrl,
            alt:
              res.dropdownShortcutAlt !== undefined
                ? !!res.dropdownShortcutAlt
                : true,
            shift:
              res.dropdownShortcutShift !== undefined
                ? !!res.dropdownShortcutShift
                : true,
            meta: !!res.dropdownShortcutMeta,
          }),
        );

        const quick = formatShortcutCombo({
          key: res.shortcutKey as string | undefined,
          ctrl: !!res.shortcutCtrl,
          alt: !!res.shortcutAlt,
          shift: !!res.shortcutShift,
          meta: !!res.shortcutMeta,
        });
        setQuickShortcut(quick);
        if (quick && res.shortcutAction) {
          const custom = await loadCustomActions();
          setQuickActionLabel(
            getActionLabel(res.shortcutAction as string, custom),
          );
        } else {
          setQuickActionLabel(null);
        }

        setHideDot(!!res.hideDot);
      },
    );

    chrome.commands.getAll((commands) => {
      const mapped: ManifestCommand[] = [];
      for (const cmd of commands) {
        if (!cmd.shortcut || !cmd.name || cmd.name === "_execute_action") {
          continue;
        }
        mapped.push({
          name: cmd.name,
          description: cmd.description || cmd.name,
          shortcut: cmd.shortcut,
        });
      }
      setManifestCommands(mapped);
    });
  }, []);

  const toggleHideDot = async (checked: boolean) => {
    setHideDot(checked);
    await chrome.storage.local.set({ hideDot: checked });
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const getProviderName = (prov: string) => {
    const names: Record<string, string> = {
      openrouter: "OpenRouter Free",
      openrouter_paid: "OpenRouter Paid",
      openai: "OpenAI Capable",
      anthropic: "Anthropic Claude",
      gemini: "Google Gemini",
      google_ai_studio: "Google AI Studio",
    };
    return names[prov] || prov;
  };

  return (
    <Card className="w-[520px] border border-border bg-card shadow-lg rounded-xl select-none p-3.5 flex flex-col gap-3">
      <CardHeader className="p-0 flex flex-row items-center gap-2.5 border-b border-border/50 pb-2.5">
        <HoneLogo size={28} alt="" />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-semibold text-foreground tracking-tight m-0">
            Hone
          </CardTitle>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[9px] text-muted-foreground font-medium">
              Active in tabs
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 grid grid-cols-2 gap-3 items-stretch">
        {/* Left column: status & controls */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="bg-background border border-border/80 p-2.5 rounded-lg flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Sliders className="w-2.5 h-2.5" />
              AI provider
            </div>
            <span className="text-[10px] font-semibold text-foreground leading-tight">
              {getProviderName(provider)}
            </span>
            <span
              className="text-[9px] text-muted-foreground/80 font-mono truncate"
              title={model}
            >
              {model}
            </span>
          </div>

          <div className="bg-background border border-border/80 p-2.5 rounded-lg flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-1 text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Keyboard className="w-2.5 h-2.5" />
              Shortcuts
            </div>
            <ShortcutRow
              label="Open menu"
              combo={menuShortcut}
              description="Opens the Hone actions menu on a focused field."
            />
            {quickShortcut && quickActionLabel ? (
              <ShortcutRow
                label="Quick action"
                combo={quickShortcut}
                description={`Runs “${quickActionLabel}” on selection or inferred text.`}
              />
            ) : (
              <ShortcutRow
                label="Quick action"
                combo={null}
                description="Optional one-key action — set in Settings → Shortcuts."
                configured={false}
              />
            )}
            {manifestCommands.length > 0 && (
              <div className="flex flex-col gap-0.5 pt-1 border-t border-border/50">
                <div className="flex items-center gap-1 text-[7px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <ListTree className="w-2 h-2" />
                  Built-in
                </div>
                {manifestCommands.map((cmd) => (
                  <div
                    key={cmd.name}
                    className="flex items-center justify-between gap-1 text-[8px]"
                  >
                    <span className="text-muted-foreground truncate">
                      {cmd.description}
                    </span>
                    <span className="font-mono text-foreground/90 shrink-0 text-[7px]">
                      {cmd.shortcut}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-background border border-border/80 p-2.5 rounded-lg gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[9px] font-semibold text-foreground leading-tight">
                Hide trigger dot
              </span>
              <span className="text-[8px] text-muted-foreground leading-snug">
                Use shortcuts to open the menu
              </span>
            </div>
            <MaterialDesign3Switch
              variant="primary"
              size="sm"
              checked={hideDot}
              onCheckedChange={toggleHideDot}
              haptic="none"
            />
          </div>
        </div>

        {/* Right column: guide & settings */}
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          <div className="flex-1 rounded-lg border border-border/40 bg-foreground/[0.02] p-2.5 text-[9px] text-muted-foreground leading-relaxed overflow-y-auto max-h-[220px]">
            <p className="font-semibold text-foreground text-[10px] m-0 mb-1.5">
              Get started
            </p>
            <ol className="m-0 pl-3 flex flex-col gap-1 list-decimal marker:text-muted-foreground/70">
              <li>
                <strong className="text-foreground/90">Settings</strong> → add
                an API key and pick a provider.
              </li>
              <li>
                Focus any{" "}
                <strong className="text-foreground/90">input or textarea</strong>{" "}
                on a webpage.
              </li>
              <li>
                {hideDot ? (
                  <>
                    Press{" "}
                    <strong className="font-mono text-foreground/90">
                      {menuShortcut || "Alt+Shift+D"}
                    </strong>{" "}
                    for the menu.
                  </>
                ) : (
                  <>
                    Click the{" "}
                    <strong className="text-foreground/90">purple dot</strong>{" "}
                    or{" "}
                    <strong className="font-mono text-foreground/90">
                      {menuShortcut || "Alt+Shift+D"}
                    </strong>
                    .
                  </>
                )}
              </li>
              <li>
                Select text (or place the caret), choose an action — Hone
                replaces only that span.
              </li>
              <li>
                Optional quick-action shortcut in Settings for one-step
                rewrites.
              </li>
            </ol>
          </div>

          <MaterialDesign3Button
            variant="default"
            size="default"
            shape="round"
            onClick={openOptions}
            className="w-full shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
            Open settings
          </MaterialDesign3Button>
        </div>
      </CardContent>
    </Card>
  );
}
