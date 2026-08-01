"use client";

export default function BookmarkletPage() {
  const js = `javascript:(function(){var t=document.title||'';var u=location.href;var s=window.getSelection()?.toString()||'';var d=JSON.stringify({title:t,url:u,snippet:s,source:'bookmarklet'});var x=new XMLHttpRequest();x.open('POST','/api/v1/leads/manual',true);x.setRequestHeader('Content-Type','application/json');x.send(d);alert('Lead captured!');})()`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarklet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-click lead capture from any page in your browser.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="font-medium">Setup</h2>
        <p className="text-sm text-muted-foreground">
          Drag the button below to your bookmarks bar. Then, when you find a lead on any page:
        </p>
        <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
          <li>Select some text on the page (the job description, requirements, etc.)</li>
          <li>Click the <strong>📥 Capture Lead</strong> bookmark</li>
          <li>The lead is scored and saved to your pipeline</li>
        </ol>

        <div className="pt-2">
          <a
            href={js}
            onClick={(e) => e.preventDefault()}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 cursor-grab"
          >
            📥 Capture Lead
          </a>
          <p className="text-xs text-muted-foreground mt-2">
            Drag this button to your bookmarks bar. Do not click it here.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <h2 className="font-medium">What it captures</h2>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li><strong>Title:</strong> the page title</li>
          <li><strong>URL:</strong> the current page URL</li>
          <li><strong>Snippet:</strong> any text you have selected on the page</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Leads are scored with niche <code className="bg-muted rounded px-1 text-xs">plugin_dev</code> by default.
          Edit the niche in the dashboard after capture.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <h2 className="font-medium">Requirements</h2>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>Backend must be running on <code className="bg-muted rounded px-1 text-xs">localhost:8080</code></li>
          <li>The bookmarklet POSTs to <code className="bg-muted rounded px-1 text-xs">/api/v1/leads/manual</code></li>
          <li>Works on any page — not just the dashboard</li>
        </ul>
      </div>
    </div>
  );
}