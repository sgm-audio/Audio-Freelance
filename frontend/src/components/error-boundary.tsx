"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  failed: boolean;
}

/**
 * Local boundary for optional UI (e.g. the WebGL visualisation). Without this,
 * a failed WebGL context throws into the route boundary and blanks the page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="h-48 rounded-lg bg-card border border-border flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {this.props.label ?? "This widget is unavailable."}
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
