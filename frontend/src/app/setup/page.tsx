"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/api";

const STEPS = ["Welcome", "Skills", "Domains", "Rate", "Finish"];

const LANGUAGE_OPTIONS = ["c++", "rust", "python", "javascript", "c", "c#", "java", "go"];
const FRAMEWORK_OPTIONS = ["juce", "nih-plug", "clap-rs", "vst3", "ara2", "clap", "au", "aax", "reaper", "wwise", "fmod"];
const DOMAIN_OPTIONS = ["real-time audio dsp", "plugin development", "audio ml", "reaper scripting", "game audio", "speech processing", "music production"];
const DEALBREAKER_OPTIONS = ["revenue share", "equity only", "unpaid", "free work", "for exposure", "sweat equity"];
const SENIORITY_OPTIONS = ["junior", "mid-level", "senior", "lead", "staff", "principal"];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [rateFloor, setRateFloor] = useState("");
  const [hourlyFloor, setHourlyFloor] = useState("");
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<string[]>([]);
  const [niches, setNiches] = useState<string[]>([]);

  function toggle(arr: string[], set: (v: string[]) => void, item: string) {
    set(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await saveProfile({
        identity: { name: "", location: "", timezone: "", remote_ok: true, relocation_ok: false },
        skills: { languages, frameworks, domains, specializations: [] },
        preferences: { niches, excluded_niches: [], dealbreakers, rate_floor: parseInt(rateFloor)||0, hourly_floor: parseInt(hourlyFloor)||0, contract_types: [] },
        experience: { years: null, seniority },
        portfolio: { github: "", website: "", notable_work: [] },
      });
      router.push("/");
    } catch { setSaving(false); }
  }

  return (
    <div className="max-w-lg mx-auto mt-12">
      <div className="flex gap-1 mb-8">{STEPS.map((s,i)=><div key={s} className={`h-1 flex-1 rounded ${i<=step?"bg-primary":"bg-border"}`}/>)}</div>

      {step===0&&<div className="space-y-6">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-muted-foreground">Let's set up your freelance profile. Everything is optional — skip or edit later.</p>
        <p className="text-sm text-muted-foreground">The more you add, the better we can filter leads to match your skills and rate.</p>
        <div className="flex justify-between pt-4">
          <button onClick={()=>router.push("/")} className="text-sm text-muted-foreground hover:text-foreground">Skip for now</button>
          <button onClick={()=>setStep(1)} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">Get Started</button>
        </div>
      </div>}

      {step===1&&<div className="space-y-6">
        <h1 className="text-2xl font-semibold">Your Skills</h1>
        <p className="text-xs text-muted-foreground uppercase mb-2">Languages</p>
        <div className="flex flex-wrap gap-2">{LANGUAGE_OPTIONS.map(l=><button key={l} onClick={()=>toggle(languages,setLanguages,l)} className={`rounded-md px-3 py-1.5 text-xs border ${languages.includes(l)?"bg-primary border-primary text-primary-foreground":"border-border hover:bg-accent"}`}>{l}</button>)}</div>
        <p className="text-xs text-muted-foreground uppercase mb-2 mt-4">Frameworks & Tools</p>
        <div className="flex flex-wrap gap-2">{FRAMEWORK_OPTIONS.map(f=><button key={f} onClick={()=>toggle(frameworks,setFrameworks,f)} className={`rounded-md px-3 py-1.5 text-xs border ${frameworks.includes(f)?"bg-primary border-primary text-primary-foreground":"border-border hover:bg-accent"}`}>{f}</button>)}</div>
        <div className="flex justify-between pt-4">
          <button onClick={()=>setStep(0)} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
          <button onClick={()=>setStep(2)} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">Next</button>
        </div>
      </div>}

      {step===2&&<div className="space-y-6">
        <h1 className="text-2xl font-semibold">Your Domains</h1>
        <div className="flex flex-wrap gap-2">{DOMAIN_OPTIONS.map(d=><button key={d} onClick={()=>toggle(domains,setDomains,d)} className={`rounded-md px-3 py-1.5 text-xs border ${domains.includes(d)?"bg-primary border-primary text-primary-foreground":"border-border hover:bg-accent"}`}>{d}</button>)}</div>
        <p className="text-xs text-muted-foreground uppercase mb-2 mt-4">Niches (optional)</p>
        <div className="flex flex-wrap gap-2">{["plugin_dev","reaper_scripts","rust_audio","audio_ml","game_audio_dev"].map(n=><button key={n} onClick={()=>toggle(niches,setNiches,n)} className={`rounded-md px-3 py-1.5 text-xs border ${niches.includes(n)?"bg-primary border-primary text-primary-foreground":"border-border hover:bg-accent"}`}>{n.replace("_"," ")}</button>)}</div>
        <div className="flex justify-between pt-4">
          <button onClick={()=>setStep(1)} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
          <button onClick={()=>setStep(3)} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">Next</button>
        </div>
      </div>}

      {step===3&&<div className="space-y-6">
        <h1 className="text-2xl font-semibold">Rate & Preferences</h1>
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-xs text-muted-foreground uppercase mb-1">Min Project (CAD)</p><input type="number" value={rateFloor} onChange={e=>setRateFloor(e.target.value)} placeholder="e.g. 3000" className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></div>
          <div><p className="text-xs text-muted-foreground uppercase mb-1">Min Hourly (CAD)</p><input type="number" value={hourlyFloor} onChange={e=>setHourlyFloor(e.target.value)} placeholder="e.g. 150" className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/></div>
        </div>
        <p className="text-xs text-muted-foreground uppercase mb-2">Seniority</p>
        <div className="flex flex-wrap gap-2">{SENIORITY_OPTIONS.map(s=><button key={s} onClick={()=>toggle(seniority,setSeniority,s)} className={`rounded-md px-3 py-1.5 text-xs border ${seniority.includes(s)?"bg-primary border-primary text-primary-foreground":"border-border hover:bg-accent"}`}>{s}</button>)}</div>
        <p className="text-xs text-muted-foreground uppercase mb-2">Dealbreakers</p>
        <div className="flex flex-wrap gap-2">{DEALBREAKER_OPTIONS.map(d=><button key={d} onClick={()=>toggle(dealbreakers,setDealbreakers,d)} className={`rounded-md px-3 py-1.5 text-xs border ${dealbreakers.includes(d)?"bg-red-500/20 border-red-500/50 text-red-400":"border-border hover:bg-accent"}`}>{d}</button>)}</div>
        <div className="flex justify-between pt-4">
          <button onClick={()=>setStep(2)} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
          <button onClick={()=>setStep(4)} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">Next</button>
        </div>
      </div>}

      {step===4&&<div className="space-y-6">
        <h1 className="text-2xl font-semibold">All Set!</h1>
        <div className="space-y-2 text-sm">
          {languages.length>0&&<p>Languages: <span className="text-muted-foreground">{languages.join(", ")}</span></p>}
          {frameworks.length>0&&<p>Frameworks: <span className="text-muted-foreground">{frameworks.join(", ")}</span></p>}
          {domains.length>0&&<p>Domains: <span className="text-muted-foreground">{domains.join(", ")}</span></p>}
          {seniority.length>0&&<p>Seniority: <span className="text-muted-foreground">{seniority.join(", ")}</span></p>}
          {rateFloor&&<p>Min Rate: <span className="text-muted-foreground">${rateFloor} CAD</span></p>}
          {hourlyFloor&&<p>Min Hourly: <span className="text-muted-foreground">${hourlyFloor}/hr</span></p>}
          {dealbreakers.length>0&&<p>Dealbreakers: <span className="text-muted-foreground">{dealbreakers.join(", ")}</span></p>}
        </div>
        <p className="text-xs text-muted-foreground">Edit anytime in <strong>Preferences</strong>.</p>
        <div className="flex justify-between pt-4">
          <button onClick={()=>setStep(3)} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
          <button onClick={handleFinish} disabled={saving} className="rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm disabled:opacity-50">{saving?"Saving...":"Finish → Dashboard"}</button>
        </div>
      </div>}
    </div>
  );
}
