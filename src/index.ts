const { Elm } = require("./Main.elm");
require("./sheet.css");
require("./misc.css");
import { getWallets, Wallets } from "@wallet-standard/core";
import { Adapter } from "@solana/wallet-adapter-base";
import {
  StandardWalletAdapter,
  isWalletAdapterCompatibleWallet,
} from "@solana/wallet-standard-wallet-adapter-base";

const MODAL_ID: string = "__sc__outer_modal";
const ELM_APP_ID: string = "__sc__elm_app";
const CONNECTION_EVENT: string = "__sc__ev_connect";
const VISIBILITY_EVENT: string = "__sc__ev_vis";

interface SolanaConnectConfig {
  debug?: boolean;
  additionalAdapters?: Adapter[];
}

/* eslint-disable fp/no-this, fp/no-mutation, fp/no-class */
class SolanaConnect {
  isOpen: boolean;
  debug: boolean;
  activeWallet: string | null;
  private options: Map<string, Adapter>;
  private elmApp: ElmApp;
  private wallets: Wallets;

  constructor(config?: SolanaConnectConfig) {
    this.wallets = getWallets();
    this.isOpen = false;
    this.debug = config?.debug || false;
    this.options = new Map();
    this.activeWallet = null;
    openModal();
    this.elmApp = Elm.Main.init({
      node: document.getElementById(ELM_APP_ID),
      flags: {},
    });

    this.elmApp.ports.close.subscribe(() => {
      this.showMenu(false);
    });

    this.elmApp.ports.connect.subscribe((tag: string) =>
      (async () => {
        const wallet = this.options.get(tag);

        if (!wallet) {
          throw new Error(`Wallet not found: ${tag}`);
        }

        await wallet.connect();

        if (!wallet.connected || !wallet.publicKey) {
          throw new Error(`Wallet not connected: ${wallet.name}`);
        }

        wallet.on("disconnect", () => {
          wallet.removeListener("disconnect");
          this.log("disconnected");
          this.activeWallet = null;
          const event = new CustomEvent(CONNECTION_EVENT, { detail: null });
          document.dispatchEvent(event);
          this.elmApp.ports.disconnectIn.send(null);
        });

        this.activeWallet = tag;
        this.elmApp.ports.connectCb.send(wallet.publicKey.toString());

        const event = new CustomEvent(CONNECTION_EVENT, { detail: wallet });
        document.dispatchEvent(event);
        this.showMenu(false);
      })().catch((e) => {
        this.elmApp.ports.connectCb.send(null);
        this.log(e);
      })
    );

    this.elmApp.ports.disconnect.subscribe((close: boolean) =>
      (async () => {
        if (close) {
          this.showMenu(false);
        }
        const wallet = this.getWallet();
        if (wallet) {
          this.log("disconnecting", wallet.name);
          await wallet.disconnect();
        }
      })().catch((e) => {
        this.log(e);
      })
    );

    const processWallet = (wl: Adapter) => {
      if (this.options.has(wl.name)) {
        this.log("wallet repeat:", wl.name);
        return;
      }
      this.options.set(wl.name, wl);
      this.elmApp.ports.walletsCb.send([
        {
          name: wl.name,
          icon: wl.icon,
        },
      ]);
    };

    this.wallets.get().forEach((newWallet) => {
      if (isWalletAdapterCompatibleWallet(newWallet)) {
        this.log("wallet read:", newWallet.name);
        processWallet(new StandardWalletAdapter({ wallet: newWallet }));
      }
    });

    this.wallets.on("register", (adp) => {
      if (isWalletAdapterCompatibleWallet(adp)) {
        this.log("wallet registered:", adp.name);
        processWallet(new StandardWalletAdapter({ wallet: adp }));
      } else {
        this.log("wallet not compatible:", adp.name);
      }
    });

    if (config?.additionalAdapters) {
      config.additionalAdapters.forEach(processWallet);
    }

    setTimeout(() => this.elmApp.ports.walletTimeout.send(null), 2500);
  }
  openMenu() {
    this.showMenu(true);
  }
  getWallet(): Adapter | null {
    if (!this.activeWallet) {
      return null;
    }
    const w = this.options.get(this.activeWallet);
    return w || null;
  }
  onWalletChange(callback: (_: Adapter | null) => void) {
    document.addEventListener(CONNECTION_EVENT, (ev: any) => {
      callback(ev.detail);
    });
  }
  onVisibilityChange(callback: (_: boolean) => void) {
    document.addEventListener(VISIBILITY_EVENT, (ev: any) => {
      callback(ev.detail);
    });
  }
  private showMenu(val: boolean) {
    const modal = document.getElementById(MODAL_ID);

    if (modal) {
      modal.style.display = val ? "block" : "none";
    }

    this.isOpen = val;

    const event = new CustomEvent(VISIBILITY_EVENT, { detail: this.isOpen });

    document.dispatchEvent(event);
  }
  // eslint-disable-next-line fp/no-rest-parameters
  private log(...xs: any[]) {
    if (this.debug) {
      console.log(...xs);
    }
  }
}
/* eslint-enable fp/no-this, fp/no-mutation, fp/no-class */

function openModal() {
  /* eslint-disable fp/no-mutation */
  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.zIndex = "1000";
  modal.style.display = "none";

  const inner = document.createElement("div");
  inner.id = ELM_APP_ID;
  inner.style.width = "100%";
  inner.style.height = "100%";
  /* eslint-enable fp/no-mutation */

  modal.appendChild(inner);

  document.body.appendChild(modal);
}

interface ElmApp {
  ports: Ports;
}

interface Ports {
  walletTimeout: PortIn;
  walletsCb: PortIn;
  disconnectIn: PortIn;
  connectCb: PortIn;

  close: PortOut;
  connect: PortOut;
  disconnect: PortOut;
}

interface PortOut {
  subscribe: (_: (_: any) => void) => void;
}

interface PortIn {
  send: (_: any) => void;
}

export { SolanaConnect, SolanaConnectConfig };
