import type { WebviewApi } from "vscode-webview";

declare function acquireVsCodeApi(): WebviewApi<unknown>;


/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension scripts.
 *
 * This utility also enables webview code to be run in a web browser-based
 * dev server by using a mock VS Code API when the real one isn't available.
 */
class VSCodeAPIWrapper {
    private readonly vsCodeApi: WebviewApi<unknown> | undefined;

    constructor() {
        // Check if the acquireVsCodeApi function exists in the current global context
        if (typeof acquireVsCodeApi === "function") {
            this.vsCodeApi = acquireVsCodeApi();
        }
    }

    /**
     * Post a message to the extension code.
     *
     * @param message The message to send to the extension code.
     * The message must be an object with a "type" property.
     */
    public postMessage(message: unknown): void {
        if (this.vsCodeApi) {
            this.vsCodeApi.postMessage(message);
        } else {
            console.log("VS Code API unavailable. Message not sent:", message);
        }
    }

    /**
     * Get the persistent state stored for this webview.
     *
     * @returns The current state or undefined if no state has been set.
     */
    public getState(): unknown | undefined {
        if (this.vsCodeApi) {
            return this.vsCodeApi.getState();
        } else {
            const state = localStorage.getItem("vscodeState");
            return state ? JSON.parse(state) : undefined;
        }
    }

    /**
     * Set the persistent state stored for this webview.
     *
     * @param newState The new state to store.
     * @returns The new state.
     */
    public setState<T>(newState: T): T {
        if (this.vsCodeApi) {
            return this.vsCodeApi.setState(newState);
        } else {
            localStorage.setItem("vscodeState", JSON.stringify(newState));
            return newState;
        }
    }
}

// Export a single instance of the wrapper
export const vscode = new VSCodeAPIWrapper();
