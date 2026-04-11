/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * Run `npm run sync:lobehub-icons` to regenerate from @lobehub/icons.
 */

export type LobehubManifestGroup = 'model' | 'provider' | 'application';
export type LobehubManifestStaticVariant = 'mono' | 'color' | 'brand' | 'brand-color' | 'text' | 'text-cn' | 'text-color' | 'avatar';
export type LobehubManifestVariant = LobehubManifestStaticVariant | 'combine';
export type LobehubManifestFormat = 'svg' | 'png' | 'webp' | 'avatar';

export interface LobehubManifestVariantEntry {
  supported: boolean;
  staticSupport: boolean;
  formats: LobehubManifestFormat[];
  urls: {
    svg?: string;
    png?: { light: string; dark: string };
    webp?: { light: string; dark: string };
    avatar?: string;
  };
}

export interface LobehubManifestEntry {
  iconId: string;
  componentId: string;
  docsUrl: string;
  title: string;
  fullTitle: string;
  group: LobehubManifestGroup;
  color: string;
  colorGradient?: string;
  capabilities: {
    hasAvatar: boolean;
    hasBrand: boolean;
    hasBrandColor: boolean;
    hasColor: boolean;
    hasCombine: boolean;
    hasText: boolean;
    hasTextCn: boolean;
    hasTextColor: boolean;
  };
  variants: Partial<Record<LobehubManifestVariant, LobehubManifestVariantEntry>>;
}

export const LOBEHUB_ICON_MANIFEST: LobehubManifestEntry[] = [
  {
    "iconId": "ace",
    "componentId": "Ace",
    "docsUrl": "ace",
    "title": "ace",
    "fullTitle": "ACE",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ace.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ace.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ace.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ace.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ace.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ace-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ace-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ace-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ace-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ace-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ace.webp"
        }
      }
    }
  },
  {
    "iconId": "adobe",
    "componentId": "Adobe",
    "docsUrl": "adobe",
    "title": "Adobe",
    "fullTitle": "Adobe",
    "group": "application",
    "color": "#EB1000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobe.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/adobe.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/adobe.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/adobe.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/adobe.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobe-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/adobe-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/adobe-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/adobe-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/adobe-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobe-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/adobe-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/adobe-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/adobe-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/adobe-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/adobe.webp"
        }
      }
    }
  },
  {
    "iconId": "adobefirefly",
    "componentId": "AdobeFirefly",
    "docsUrl": "adobe-firefly",
    "title": "AdobeFirefly",
    "fullTitle": "Firefly (Adobe)",
    "group": "application",
    "color": "#EB1000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobefirefly.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/adobefirefly.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/adobefirefly.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/adobefirefly.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/adobefirefly.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobefirefly-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/adobefirefly-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/adobefirefly-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/adobefirefly-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/adobefirefly-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/adobefirefly-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/adobefirefly-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/adobefirefly-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/adobefirefly-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/adobefirefly-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/adobefirefly.webp"
        }
      }
    }
  },
  {
    "iconId": "agentvoice",
    "componentId": "AgentVoice",
    "docsUrl": "agent-voice",
    "title": "AgentVoice",
    "fullTitle": "AgentVoice",
    "group": "provider",
    "color": "#0f6fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/agentvoice.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/agentvoice.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/agentvoice.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/agentvoice.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/agentvoice.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/agentvoice-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/agentvoice-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/agentvoice-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/agentvoice-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/agentvoice-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/agentvoice-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/agentvoice-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/agentvoice-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/agentvoice-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/agentvoice-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/agentvoice.webp"
        }
      }
    }
  },
  {
    "iconId": "agui",
    "componentId": "Agui",
    "docsUrl": "agui",
    "title": "AG-UI",
    "fullTitle": "AG-UI",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/agui.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/agui.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/agui.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/agui.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/agui.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/agui-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/agui-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/agui-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/agui-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/agui-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/agui.webp"
        }
      }
    }
  },
  {
    "iconId": "ai2",
    "componentId": "Ai2",
    "docsUrl": "ai2",
    "title": "Ai2",
    "fullTitle": "Ai2",
    "group": "model",
    "color": "#f0529c",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai2.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai2.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai2.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai2.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai2.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai2-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai2-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai2-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai2-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai2-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai2-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai2-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai2-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai2-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai2-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ai2.webp"
        }
      }
    }
  },
  {
    "iconId": "ai21",
    "componentId": "Ai21",
    "docsUrl": "ai21",
    "title": "AI21",
    "fullTitle": "Ai21Labs (Jamba)",
    "group": "model",
    "color": "#E91E63",
    "colorGradient": "linear-gradient(-45deg, #F68CB2,  #E91E63)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai21.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai21.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai21.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai21.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai21.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai21-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai21-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai21-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai21-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai21-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai21-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai21-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai21-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai21-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai21-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai21-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai21-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai21-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai21-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai21-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ai21.webp"
        }
      }
    }
  },
  {
    "iconId": "ai302",
    "componentId": "Ai302",
    "docsUrl": "ai302",
    "title": "302.AI",
    "fullTitle": "302.AI",
    "group": "provider",
    "color": "#8E47FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai302.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai302.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai302.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai302.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai302.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai302-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai302-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai302-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai302-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai302-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai302-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai302-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai302-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai302-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai302-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ai302.webp"
        }
      }
    }
  },
  {
    "iconId": "ai360",
    "componentId": "Ai360",
    "docsUrl": "ai360",
    "title": "AI360",
    "fullTitle": "Ai360 (360智脑)",
    "group": "provider",
    "color": "#006ffb",
    "colorGradient": "linear-gradient(to bottom, #12B7FA,  #006ffb)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai360.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai360.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai360.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai360.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai360.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai360-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai360-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai360-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai360-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai360-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ai360-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ai360-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ai360-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ai360-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ai360-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ai360.webp"
        }
      }
    }
  },
  {
    "iconId": "aihubmix",
    "componentId": "AiHubMix",
    "docsUrl": "ai-hub-mix",
    "title": "AiHubMix",
    "fullTitle": "AiHubMix (推理时代)",
    "group": "provider",
    "color": "#006FFB",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aihubmix.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aihubmix.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aihubmix.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aihubmix.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aihubmix.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aihubmix-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aihubmix-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aihubmix-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aihubmix-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aihubmix-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aihubmix-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aihubmix-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aihubmix-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aihubmix-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aihubmix-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/aihubmix.webp"
        }
      }
    }
  },
  {
    "iconId": "aimass",
    "componentId": "AiMass",
    "docsUrl": "ai-mass",
    "title": "AiMass",
    "fullTitle": "AiMass (紫东太初)",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aimass.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aimass.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aimass.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aimass.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aimass.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aimass-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aimass-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aimass-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aimass-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aimass-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aimass-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aimass-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aimass-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aimass-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aimass-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/aimass.webp"
        }
      }
    }
  },
  {
    "iconId": "aionlabs",
    "componentId": "AionLabs",
    "docsUrl": "aion-labs",
    "title": "AionLabs",
    "fullTitle": "AionLabs",
    "group": "model",
    "color": "#0f172a",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aionlabs.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aionlabs.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aionlabs.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aionlabs.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aionlabs.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aionlabs-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aionlabs-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aionlabs-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aionlabs-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aionlabs-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aionlabs-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aionlabs-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aionlabs-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aionlabs-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aionlabs-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/aionlabs.webp"
        }
      }
    }
  },
  {
    "iconId": "aistudio",
    "componentId": "AiStudio",
    "docsUrl": "ai-studio",
    "title": "Google AI Studio",
    "fullTitle": "AI Studio (Google)",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aistudio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aistudio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aistudio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aistudio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aistudio.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aistudio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aistudio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aistudio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aistudio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aistudio-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/aistudio.webp"
        }
      }
    }
  },
  {
    "iconId": "akashchat",
    "componentId": "AkashChat",
    "docsUrl": "akash-chat",
    "title": "AkashChat",
    "fullTitle": "AkashChat",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/akashchat.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/akashchat.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/akashchat.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/akashchat.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/akashchat.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/akashchat-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/akashchat-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/akashchat-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/akashchat-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/akashchat-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/akashchat-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/akashchat-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/akashchat-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/akashchat-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/akashchat-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/akashchat.webp"
        }
      }
    }
  },
  {
    "iconId": "alephalpha",
    "componentId": "AlephAlpha",
    "docsUrl": "aleph-alpha",
    "title": "AlephAlpha",
    "fullTitle": "AlephAlpha",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alephalpha.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alephalpha.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alephalpha.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alephalpha.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alephalpha.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alephalpha-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alephalpha-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alephalpha-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alephalpha-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alephalpha-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/alephalpha.webp"
        }
      }
    }
  },
  {
    "iconId": "alibaba",
    "componentId": "Alibaba",
    "docsUrl": "alibaba",
    "title": "Alibaba",
    "fullTitle": "Alibaba",
    "group": "provider",
    "color": "#FF6003",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibaba.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibaba.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibaba.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibaba.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibaba.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibaba-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibaba-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibaba-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibaba-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibaba-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibaba-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibaba-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibaba-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibaba-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibaba-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibaba-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibaba-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibaba-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibaba-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibaba-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibaba-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibaba-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibaba-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibaba-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibaba-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibaba-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibaba-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibaba-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibaba-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibaba-text-cn.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/alibaba.webp"
        }
      }
    }
  },
  {
    "iconId": "alibabacloud",
    "componentId": "AlibabaCloud",
    "docsUrl": "alibaba-cloud",
    "title": "AlibabaCloud",
    "fullTitle": "AlibabaCloud (阿里云)",
    "group": "provider",
    "color": "#FF6A00",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibabacloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibabacloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibabacloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibabacloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibabacloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibabacloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibabacloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibabacloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibabacloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibabacloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibabacloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibabacloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibabacloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibabacloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibabacloud-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/alibabacloud-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/alibabacloud-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/alibabacloud-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/alibabacloud-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/alibabacloud-text-cn.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/alibabacloud.webp"
        }
      }
    }
  },
  {
    "iconId": "amp",
    "componentId": "Amp",
    "docsUrl": "amp",
    "title": "Amp",
    "fullTitle": "Amp",
    "group": "application",
    "color": "#F34E3F",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/amp.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/amp.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/amp.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/amp.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/amp.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/amp-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/amp-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/amp-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/amp-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/amp-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/amp-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/amp-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/amp-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/amp-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/amp-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/amp.webp"
        }
      }
    }
  },
  {
    "iconId": "antgroup",
    "componentId": "AntGroup",
    "docsUrl": "ant-group",
    "title": "AntGroup",
    "fullTitle": "AntGroup",
    "group": "provider",
    "color": "#1677ff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antgroup.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antgroup.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antgroup.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antgroup.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antgroup.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antgroup-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antgroup-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antgroup-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antgroup-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antgroup-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antgroup-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antgroup-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antgroup-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antgroup-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antgroup-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antgroup-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antgroup-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antgroup-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antgroup-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antgroup-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antgroup-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antgroup-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antgroup-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antgroup-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antgroup-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antgroup-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antgroup-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antgroup-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antgroup-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antgroup-text-cn.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/antgroup.webp"
        }
      }
    }
  },
  {
    "iconId": "anthropic",
    "componentId": "Anthropic",
    "docsUrl": "anthropic",
    "title": "Anthropic",
    "fullTitle": "Anthropic",
    "group": "provider",
    "color": "#F1F0E8",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/anthropic.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/anthropic.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/anthropic.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/anthropic.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/anthropic.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/anthropic-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/anthropic-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/anthropic-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/anthropic-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/anthropic-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/anthropic.webp"
        }
      }
    }
  },
  {
    "iconId": "antigravity",
    "componentId": "Antigravity",
    "docsUrl": "antigravity",
    "title": "Antigravity",
    "fullTitle": "Antigravity (Google)",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antigravity.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antigravity.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antigravity.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antigravity.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antigravity.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antigravity-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antigravity-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antigravity-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antigravity-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antigravity-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/antigravity-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/antigravity-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/antigravity-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/antigravity-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/antigravity-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/antigravity.webp"
        }
      }
    }
  },
  {
    "iconId": "anyscale",
    "componentId": "Anyscale",
    "docsUrl": "anyscale",
    "title": "Anyscale",
    "fullTitle": "Anyscale",
    "group": "provider",
    "color": "#0163FB",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/anyscale.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/anyscale.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/anyscale.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/anyscale.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/anyscale.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/anyscale-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/anyscale-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/anyscale-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/anyscale-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/anyscale-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/anyscale-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/anyscale-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/anyscale-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/anyscale-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/anyscale-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/anyscale.webp"
        }
      }
    }
  },
  {
    "iconId": "apertis",
    "componentId": "Apertis",
    "docsUrl": "apertis",
    "title": "Apertis",
    "fullTitle": "Apertis",
    "group": "provider",
    "color": "#0d9488",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/apertis.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/apertis.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/apertis.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/apertis.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/apertis.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/apertis-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/apertis-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/apertis-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/apertis-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/apertis-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/apertis-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/apertis-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/apertis-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/apertis-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/apertis-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/apertis.webp"
        }
      }
    }
  },
  {
    "iconId": "apple",
    "componentId": "Apple",
    "docsUrl": "apple",
    "title": "Apple",
    "fullTitle": "Apple",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/apple.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/apple.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/apple.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/apple.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/apple.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/apple-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/apple-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/apple-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/apple-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/apple-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/apple.webp"
        }
      }
    }
  },
  {
    "iconId": "arcee",
    "componentId": "Arcee",
    "docsUrl": "arcee",
    "title": "Arcee",
    "fullTitle": "Arcee",
    "group": "model",
    "color": "#008C8C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/arcee.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/arcee.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/arcee.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/arcee.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/arcee.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/arcee-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/arcee-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/arcee-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/arcee-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/arcee-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/arcee-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/arcee-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/arcee-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/arcee-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/arcee-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/arcee.webp"
        }
      }
    }
  },
  {
    "iconId": "askverdict",
    "componentId": "AskVerdict",
    "docsUrl": "ask-verdict",
    "title": "AskVerdict",
    "fullTitle": "AskVerdict",
    "group": "application",
    "color": "#E8A317",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/askverdict.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/askverdict.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/askverdict.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/askverdict.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/askverdict.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/askverdict-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/askverdict-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/askverdict-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/askverdict-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/askverdict-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/askverdict-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/askverdict-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/askverdict-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/askverdict-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/askverdict-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/askverdict.webp"
        }
      }
    }
  },
  {
    "iconId": "assemblyai",
    "componentId": "AssemblyAI",
    "docsUrl": "assembly-ai",
    "title": "AssemblyAI",
    "fullTitle": "AssemblyAI",
    "group": "model",
    "color": "#2545D3",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/assemblyai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/assemblyai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/assemblyai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/assemblyai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/assemblyai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/assemblyai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/assemblyai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/assemblyai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/assemblyai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/assemblyai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/assemblyai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/assemblyai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/assemblyai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/assemblyai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/assemblyai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/assemblyai.webp"
        }
      }
    }
  },
  {
    "iconId": "atlascloud",
    "componentId": "AtlasCloud",
    "docsUrl": "atlas-cloud",
    "title": "Atlas Cloud",
    "fullTitle": "AtlasCloud",
    "group": "provider",
    "color": "#7036F0",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/atlascloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/atlascloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/atlascloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/atlascloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/atlascloud.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/atlascloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/atlascloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/atlascloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/atlascloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/atlascloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/atlascloud.webp"
        }
      }
    }
  },
  {
    "iconId": "automatic",
    "componentId": "Automatic",
    "docsUrl": "automatic",
    "title": "Automatic",
    "fullTitle": "Automatic1111 (SD Webui)",
    "group": "application",
    "color": "#E00054",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/automatic.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/automatic.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/automatic.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/automatic.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/automatic.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/automatic-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/automatic-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/automatic-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/automatic-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/automatic-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/automatic-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/automatic-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/automatic-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/automatic-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/automatic-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/automatic.webp"
        }
      }
    }
  },
  {
    "iconId": "aws",
    "componentId": "Aws",
    "docsUrl": "aws",
    "title": "AWS",
    "fullTitle": "AWS",
    "group": "provider",
    "color": "#222F3E",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aws.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aws.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aws.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aws.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aws.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aws-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aws-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aws-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aws-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aws-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aws-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aws-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aws-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aws-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aws-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aws-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aws-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aws-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aws-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aws-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aws-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aws-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aws-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aws-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aws-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/aws.webp"
        }
      }
    }
  },
  {
    "iconId": "aya",
    "componentId": "Aya",
    "docsUrl": "aya",
    "title": "Aya",
    "fullTitle": "Aya (Cohere)",
    "group": "model",
    "color": "#416FDC",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aya.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aya.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aya.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aya.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aya.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aya-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aya-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aya-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aya-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aya-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/aya-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/aya-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/aya-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/aya-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/aya-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/aya.webp"
        }
      }
    }
  },
  {
    "iconId": "azure",
    "componentId": "Azure",
    "docsUrl": "azure",
    "title": "Azure",
    "fullTitle": "Microsoft Azure",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azure.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/azure.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/azure.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/azure.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/azure.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azure-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/azure-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/azure-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/azure-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/azure-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azure-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/azure-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/azure-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/azure-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/azure-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/azure.webp"
        }
      }
    }
  },
  {
    "iconId": "azureai",
    "componentId": "AzureAI",
    "docsUrl": "azure-ai",
    "title": "AzureAI",
    "fullTitle": "AzureAI",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azureai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/azureai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/azureai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/azureai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/azureai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azureai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/azureai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/azureai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/azureai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/azureai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/azureai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/azureai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/azureai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/azureai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/azureai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/azureai.webp"
        }
      }
    }
  },
  {
    "iconId": "baai",
    "componentId": "BAAI",
    "docsUrl": "baai",
    "title": "BAAI",
    "fullTitle": "BAAI (智源研究院)",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/baai.webp"
        }
      }
    }
  },
  {
    "iconId": "baichuan",
    "componentId": "Baichuan",
    "docsUrl": "baichuan",
    "title": "Baichuan",
    "fullTitle": "Baichuan (百川)",
    "group": "model",
    "color": "#FF6933",
    "colorGradient": "linear-gradient(-45deg, #FF6933, #FEC13E)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baichuan.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baichuan.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baichuan.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baichuan.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baichuan.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baichuan-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baichuan-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baichuan-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baichuan-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baichuan-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baichuan-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baichuan-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baichuan-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baichuan-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baichuan-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/baichuan.webp"
        }
      }
    }
  },
  {
    "iconId": "baidu",
    "componentId": "Baidu",
    "docsUrl": "baidu",
    "title": "Baidu",
    "fullTitle": "Baidu",
    "group": "provider",
    "color": "#2932E1",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baidu.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baidu.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baidu.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baidu.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baidu.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baidu-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baidu-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baidu-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baidu-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baidu-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baidu-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baidu-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baidu-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baidu-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baidu-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baidu-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baidu-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baidu-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baidu-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baidu-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baidu-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baidu-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baidu-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baidu-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baidu-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baidu-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baidu-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baidu-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baidu-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baidu-text-cn.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/baidu.webp"
        }
      }
    }
  },
  {
    "iconId": "baiducloud",
    "componentId": "BaiduCloud",
    "docsUrl": "baidu-cloud",
    "title": "BaiduCloud",
    "fullTitle": "BaiduCloud (百度智能云)",
    "group": "provider",
    "color": "#2468f2",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baiducloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baiducloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baiducloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baiducloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baiducloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baiducloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baiducloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baiducloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baiducloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baiducloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baiducloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baiducloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baiducloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baiducloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baiducloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/baiducloud.webp"
        }
      }
    }
  },
  {
    "iconId": "bailian",
    "componentId": "Bailian",
    "docsUrl": "bailian",
    "title": "BaiLian",
    "fullTitle": "Bailian (阿里云百炼)",
    "group": "provider",
    "color": "#615ced",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bailian.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bailian.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bailian.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bailian.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bailian.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bailian-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bailian-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bailian-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bailian-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bailian-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bailian-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bailian-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bailian-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bailian-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bailian-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bailian.webp"
        }
      }
    }
  },
  {
    "iconId": "baseten",
    "componentId": "Baseten",
    "docsUrl": "baseten",
    "title": "Baseten",
    "fullTitle": "Baseten",
    "group": "provider",
    "color": "#19E76E",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baseten.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baseten.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baseten.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baseten.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baseten.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/baseten-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/baseten-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/baseten-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/baseten-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/baseten-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/baseten.webp"
        }
      }
    }
  },
  {
    "iconId": "bedrock",
    "componentId": "Bedrock",
    "docsUrl": "bedrock",
    "title": "Bedrock",
    "fullTitle": "Bedrock (AWS)",
    "group": "provider",
    "color": "#222F3E",
    "colorGradient": "linear-gradient(45deg, #9AD8F8, #3D8FFF, #6350FB)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bedrock.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bedrock.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bedrock.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bedrock.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bedrock.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bedrock-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bedrock-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bedrock-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bedrock-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bedrock-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bedrock-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bedrock-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bedrock-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bedrock-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bedrock-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bedrock.webp"
        }
      }
    }
  },
  {
    "iconId": "bfl",
    "componentId": "Bfl",
    "docsUrl": "bfl",
    "title": "Black Forest Labs",
    "fullTitle": "Black Forest Labs (bfl)",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bfl.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bfl.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bfl.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bfl.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bfl.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bfl-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bfl-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bfl-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bfl-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bfl-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bfl.webp"
        }
      }
    }
  },
  {
    "iconId": "bilibili",
    "componentId": "Bilibili",
    "docsUrl": "bilibili",
    "title": "bilibili",
    "fullTitle": "Bilibili (哔哩哔哩)",
    "group": "provider",
    "color": "#FB7299",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bilibili.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bilibili.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bilibili.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bilibili.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bilibili.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bilibili-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bilibili-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bilibili-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bilibili-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bilibili-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bilibili-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bilibili-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bilibili-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bilibili-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bilibili-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bilibili.webp"
        }
      }
    }
  },
  {
    "iconId": "bilibiliindex",
    "componentId": "BilibiliIndex",
    "docsUrl": "bilibili-index",
    "title": "bilibili index",
    "fullTitle": "Bilibili Index (Index Team)",
    "group": "model",
    "color": "#5E19B7",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bilibiliindex.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bilibiliindex.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bilibiliindex.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bilibiliindex.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bilibiliindex.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bilibiliindex-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bilibiliindex-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bilibiliindex-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bilibiliindex-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bilibiliindex-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bilibiliindex.webp"
        }
      }
    }
  },
  {
    "iconId": "bing",
    "componentId": "Bing",
    "docsUrl": "bing",
    "title": "Bing",
    "fullTitle": "Microsoft Bing",
    "group": "application",
    "color": "#174ae4",
    "colorGradient": "linear-gradient(130deg, #2870EA 20%, #1B4AEF 77.5%)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bing.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bing.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bing.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bing.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bing.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bing-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bing-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bing-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bing-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bing-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bing-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bing-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bing-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bing-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bing-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bing.webp"
        }
      }
    }
  },
  {
    "iconId": "briaai",
    "componentId": "BriaAI",
    "docsUrl": "bria-ai",
    "title": "BRIA AI",
    "fullTitle": "BRIA AI",
    "group": "provider",
    "color": "#671ECC",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/briaai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/briaai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/briaai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/briaai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/briaai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/briaai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/briaai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/briaai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/briaai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/briaai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/briaai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/briaai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/briaai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/briaai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/briaai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/briaai.webp"
        }
      }
    }
  },
  {
    "iconId": "burncloud",
    "componentId": "BurnCloud",
    "docsUrl": "burn-cloud",
    "title": "BurnCloud",
    "fullTitle": "BurnCloud",
    "group": "provider",
    "color": "#E95513",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/burncloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/burncloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/burncloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/burncloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/burncloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/burncloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/burncloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/burncloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/burncloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/burncloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/burncloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/burncloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/burncloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/burncloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/burncloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/burncloud.webp"
        }
      }
    }
  },
  {
    "iconId": "bytedance",
    "componentId": "ByteDance",
    "docsUrl": "byte-dance",
    "title": "ByteDance",
    "fullTitle": "ByteDance",
    "group": "provider",
    "color": "#325AB4",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bytedance.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bytedance.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bytedance.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bytedance.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bytedance.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bytedance-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bytedance-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bytedance-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bytedance-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bytedance-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bytedance-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bytedance-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bytedance-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bytedance-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bytedance-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bytedance-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bytedance-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bytedance-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bytedance-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bytedance-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bytedance-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bytedance-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bytedance-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bytedance-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bytedance-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/bytedance-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/bytedance-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/bytedance-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/bytedance-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/bytedance-text-cn.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/bytedance.webp"
        }
      }
    }
  },
  {
    "iconId": "capcut",
    "componentId": "CapCut",
    "docsUrl": "cap-cut",
    "title": "CapCut",
    "fullTitle": "CapCut",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/capcut.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/capcut.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/capcut.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/capcut.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/capcut.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/capcut-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/capcut-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/capcut-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/capcut-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/capcut-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/capcut.webp"
        }
      }
    }
  },
  {
    "iconId": "centml",
    "componentId": "CentML",
    "docsUrl": "cent-ml",
    "title": "CentML",
    "fullTitle": "CentML",
    "group": "provider",
    "color": "#004331",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/centml.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/centml.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/centml.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/centml.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/centml.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/centml-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/centml-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/centml-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/centml-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/centml-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/centml-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/centml-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/centml-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/centml-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/centml-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/centml-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/centml-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/centml-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/centml-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/centml-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/centml-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/centml-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/centml-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/centml-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/centml-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/centml.webp"
        }
      }
    }
  },
  {
    "iconId": "cerebras",
    "componentId": "Cerebras",
    "docsUrl": "cerebras",
    "title": "Cerebras",
    "fullTitle": "Cerebras",
    "group": "provider",
    "color": "#F15A29",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cerebras.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cerebras.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cerebras.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cerebras.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cerebras.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cerebras-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cerebras-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cerebras-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cerebras-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cerebras-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cerebras-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cerebras-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cerebras-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cerebras-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cerebras-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cerebras-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cerebras-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cerebras-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cerebras-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cerebras-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cerebras-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cerebras-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cerebras-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cerebras-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cerebras-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cerebras.webp"
        }
      }
    }
  },
  {
    "iconId": "chatglm",
    "componentId": "ChatGLM",
    "docsUrl": "chat-glm",
    "title": "ChatGLM",
    "fullTitle": "ChatGLM (智谱)",
    "group": "model",
    "color": "#4268FA",
    "colorGradient": "linear-gradient(-45deg, #3485FF,  #504AF4)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/chatglm.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/chatglm.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/chatglm.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/chatglm.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/chatglm.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/chatglm-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/chatglm-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/chatglm-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/chatglm-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/chatglm-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/chatglm-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/chatglm-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/chatglm-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/chatglm-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/chatglm-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/chatglm.webp"
        }
      }
    }
  },
  {
    "iconId": "cherrystudio",
    "componentId": "CherryStudio",
    "docsUrl": "cherry-studio",
    "title": "CherryStudio",
    "fullTitle": "Cherry Studio",
    "group": "application",
    "color": "#EA5E5D",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cherrystudio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cherrystudio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cherrystudio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cherrystudio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cherrystudio.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cherrystudio-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cherrystudio-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cherrystudio-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cherrystudio-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cherrystudio-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cherrystudio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cherrystudio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cherrystudio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cherrystudio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cherrystudio-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cherrystudio.webp"
        }
      }
    }
  },
  {
    "iconId": "civitai",
    "componentId": "Civitai",
    "docsUrl": "civitai",
    "title": "Civitai",
    "fullTitle": "Civitai",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/civitai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/civitai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/civitai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/civitai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/civitai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/civitai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/civitai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/civitai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/civitai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/civitai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/civitai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/civitai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/civitai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/civitai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/civitai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/civitai.webp"
        }
      }
    }
  },
  {
    "iconId": "claude",
    "componentId": "Claude",
    "docsUrl": "claude",
    "title": "Claude",
    "fullTitle": "Claude",
    "group": "model",
    "color": "#D97757",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claude.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/claude.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/claude.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/claude.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claude.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claude-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/claude-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/claude-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/claude-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claude-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claude-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/claude-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/claude-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/claude-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claude-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/claude.webp"
        }
      }
    }
  },
  {
    "iconId": "claudecode",
    "componentId": "ClaudeCode",
    "docsUrl": "claude-code",
    "title": "Antigravity",
    "fullTitle": "Claude Code",
    "group": "application",
    "color": "#D97757",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claudecode.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/claudecode.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/claudecode.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/claudecode.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claudecode.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claudecode-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/claudecode-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/claudecode-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/claudecode-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claudecode-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claudecode-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/claudecode-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/claudecode-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/claudecode-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/claudecode-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/claudecode.webp"
        }
      }
    }
  },
  {
    "iconId": "cline",
    "componentId": "Cline",
    "docsUrl": "cline",
    "title": "Cline",
    "fullTitle": "Cline",
    "group": "application",
    "color": "#323B43",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cline.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cline.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cline.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cline.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cline.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cline-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cline-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cline-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cline-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cline-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cline.webp"
        }
      }
    }
  },
  {
    "iconId": "clipdrop",
    "componentId": "Clipdrop",
    "docsUrl": "clipdrop",
    "title": "Clipdrop",
    "fullTitle": "Clipdrop",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/clipdrop.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/clipdrop.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/clipdrop.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/clipdrop.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/clipdrop.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/clipdrop-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/clipdrop-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/clipdrop-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/clipdrop-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/clipdrop-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/clipdrop.webp"
        }
      }
    }
  },
  {
    "iconId": "cloudflare",
    "componentId": "Cloudflare",
    "docsUrl": "cloudflare",
    "title": "Cloudflare",
    "fullTitle": "Cloudflare",
    "group": "provider",
    "color": "#F38020",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cloudflare.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cloudflare.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cloudflare.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cloudflare.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cloudflare.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cloudflare-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cloudflare-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cloudflare-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cloudflare-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cloudflare-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cloudflare-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cloudflare-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cloudflare-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cloudflare-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cloudflare-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cloudflare.webp"
        }
      }
    }
  },
  {
    "iconId": "codeflicker",
    "componentId": "CodeFlicker",
    "docsUrl": "code-flicker",
    "title": "CodeFlicker",
    "fullTitle": "CodeFlicker",
    "group": "application",
    "color": "#32EDDA",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codeflicker.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codeflicker.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codeflicker.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codeflicker.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codeflicker.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codeflicker-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codeflicker-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codeflicker-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codeflicker-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codeflicker-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codeflicker-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codeflicker-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codeflicker-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codeflicker-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codeflicker-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/codeflicker.webp"
        }
      }
    }
  },
  {
    "iconId": "codegeex",
    "componentId": "CodeGeeX",
    "docsUrl": "code-gee-x",
    "title": "CodeGeeX",
    "fullTitle": "CodeGeeX",
    "group": "model",
    "color": "#00e7e7",
    "colorGradient": "linear-gradient(to right, #00E7E7,  #00BFFF)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codegeex.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codegeex.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codegeex.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codegeex.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codegeex.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codegeex-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codegeex-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codegeex-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codegeex-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codegeex-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codegeex-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codegeex-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codegeex-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codegeex-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codegeex-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/codegeex.webp"
        }
      }
    }
  },
  {
    "iconId": "codex",
    "componentId": "Codex",
    "docsUrl": "codex",
    "title": "Codex",
    "fullTitle": "Codex (OpenAI)",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codex.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codex.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codex.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codex.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codex.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codex-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codex-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codex-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codex-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codex-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/codex-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/codex-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/codex-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/codex-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/codex-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/codex.webp"
        }
      }
    }
  },
  {
    "iconId": "cogvideo",
    "componentId": "CogVideo",
    "docsUrl": "cog-video",
    "title": "CogVideo",
    "fullTitle": "CogVideo",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cogvideo.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cogvideo.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cogvideo.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cogvideo.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cogvideo.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cogvideo-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cogvideo-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cogvideo-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cogvideo-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cogvideo-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cogvideo-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cogvideo-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cogvideo-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cogvideo-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cogvideo-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cogvideo.webp"
        }
      }
    }
  },
  {
    "iconId": "cogview",
    "componentId": "CogView",
    "docsUrl": "cog-view",
    "title": "CogView",
    "fullTitle": "CogView",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cogview.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cogview.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cogview.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cogview.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cogview.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cogview-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cogview-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cogview-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cogview-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cogview-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cogview-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cogview-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cogview-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cogview-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cogview-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cogview.webp"
        }
      }
    }
  },
  {
    "iconId": "cohere",
    "componentId": "Cohere",
    "docsUrl": "cohere",
    "title": "Cohere",
    "fullTitle": "Cohere",
    "group": "provider",
    "color": "#39594D",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cohere.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cohere.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cohere.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cohere.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cohere.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cohere-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cohere-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cohere-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cohere-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cohere-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cohere-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cohere-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cohere-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cohere-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cohere-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cohere.webp"
        }
      }
    }
  },
  {
    "iconId": "colab",
    "componentId": "Colab",
    "docsUrl": "colab",
    "title": "Colab",
    "fullTitle": "Colab (Google)",
    "group": "application",
    "color": "#F9AB00",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/colab.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/colab.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/colab.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/colab.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/colab.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/colab-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/colab-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/colab-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/colab-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/colab-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/colab-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/colab-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/colab-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/colab-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/colab-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/colab.webp"
        }
      }
    }
  },
  {
    "iconId": "cometapi",
    "componentId": "CometAPI",
    "docsUrl": "comet-api",
    "title": "CometAPI",
    "fullTitle": "Comet API",
    "group": "provider",
    "color": "#00ACE2",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cometapi.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cometapi.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cometapi.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cometapi.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cometapi.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cometapi-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cometapi-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cometapi-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cometapi-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cometapi-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cometapi-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cometapi-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cometapi-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cometapi-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cometapi-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cometapi.webp"
        }
      }
    }
  },
  {
    "iconId": "comfyui",
    "componentId": "ComfyUI",
    "docsUrl": "comfy-ui",
    "title": "ComfyUI",
    "fullTitle": "ComfyUI",
    "group": "application",
    "color": "#F0FF41",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/comfyui.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/comfyui.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/comfyui.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/comfyui.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/comfyui.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/comfyui-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/comfyui-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/comfyui-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/comfyui-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/comfyui-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/comfyui-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/comfyui-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/comfyui-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/comfyui-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/comfyui-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/comfyui.webp"
        }
      }
    }
  },
  {
    "iconId": "commanda",
    "componentId": "CommandA",
    "docsUrl": "command-a",
    "title": "CommandA",
    "fullTitle": "CommandA (Cohere)",
    "group": "model",
    "color": "#39594D",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/commanda.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/commanda.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/commanda.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/commanda.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/commanda.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/commanda-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/commanda-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/commanda-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/commanda-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/commanda-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/commanda-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/commanda-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/commanda-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/commanda-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/commanda-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/commanda.webp"
        }
      }
    }
  },
  {
    "iconId": "copilot",
    "componentId": "Copilot",
    "docsUrl": "copilot",
    "title": "Copilot",
    "fullTitle": "Microsoft Copilot",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/copilot.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/copilot.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/copilot.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/copilot.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/copilot.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/copilot-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/copilot-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/copilot-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/copilot-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/copilot-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/copilot-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/copilot-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/copilot-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/copilot-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/copilot-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/copilot.webp"
        }
      }
    }
  },
  {
    "iconId": "copilotkit",
    "componentId": "CopilotKit",
    "docsUrl": "copilot-kit",
    "title": "CopilotKit",
    "fullTitle": "CopilotKit",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/copilotkit.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/copilotkit.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/copilotkit.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/copilotkit.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/copilotkit.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/copilotkit-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/copilotkit-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/copilotkit-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/copilotkit-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/copilotkit-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/copilotkit-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/copilotkit-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/copilotkit-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/copilotkit-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/copilotkit-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/copilotkit.webp"
        }
      }
    }
  },
  {
    "iconId": "coqui",
    "componentId": "Coqui",
    "docsUrl": "coqui",
    "title": "Coqui",
    "fullTitle": "Coqui",
    "group": "application",
    "color": "#03363D",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/coqui.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/coqui.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/coqui.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/coqui.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/coqui.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/coqui-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/coqui-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/coqui-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/coqui-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/coqui-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/coqui-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/coqui-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/coqui-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/coqui-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/coqui-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/coqui.webp"
        }
      }
    }
  },
  {
    "iconId": "coze",
    "componentId": "Coze",
    "docsUrl": "coze",
    "title": "Coze",
    "fullTitle": "Coze",
    "group": "application",
    "color": "#4D53E8",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/coze.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/coze.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/coze.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/coze.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/coze.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/coze-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/coze-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/coze-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/coze-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/coze-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/coze.webp"
        }
      }
    }
  },
  {
    "iconId": "crewai",
    "componentId": "CrewAI",
    "docsUrl": "crew-ai",
    "title": "CrewAI",
    "fullTitle": "CrewAI",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crewai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crewai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crewai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crewai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crewai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crewai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crewai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crewai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crewai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crewai-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crewai-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crewai-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crewai-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crewai-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crewai-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crewai-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crewai-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crewai-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crewai-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crewai-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crewai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crewai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crewai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crewai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crewai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/crewai.webp"
        }
      }
    }
  },
  {
    "iconId": "crusoe",
    "componentId": "Crusoe",
    "docsUrl": "crusoe",
    "title": "Crusoe",
    "fullTitle": "Crusoe",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crusoe.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crusoe.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crusoe.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crusoe.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crusoe.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crusoe-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crusoe-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crusoe-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crusoe-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crusoe-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/crusoe-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/crusoe-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/crusoe-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/crusoe-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/crusoe-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/crusoe.webp"
        }
      }
    }
  },
  {
    "iconId": "cursor",
    "componentId": "Cursor",
    "docsUrl": "cursor",
    "title": "Cursor",
    "fullTitle": "Cursor",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cursor.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cursor.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cursor.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cursor.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cursor.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cursor-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cursor-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cursor-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cursor-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cursor-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cursor.webp"
        }
      }
    }
  },
  {
    "iconId": "cybercut",
    "componentId": "CyberCut",
    "docsUrl": "cyber-cut",
    "title": "CyberCut",
    "fullTitle": "CyberCut",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cybercut.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cybercut.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cybercut.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cybercut.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cybercut.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/cybercut-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/cybercut-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/cybercut-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/cybercut-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/cybercut-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/cybercut.webp"
        }
      }
    }
  },
  {
    "iconId": "dalle",
    "componentId": "Dalle",
    "docsUrl": "dalle",
    "title": "DALL-E",
    "fullTitle": "DALL·E (OpenAI)",
    "group": "model",
    "color": "#000",
    "colorGradient": "conic-gradient(from 180deg, #FFFF67, #43FFFF, #50DA4C, #FF6E3D, #3C46FF)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dalle.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dalle.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dalle.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dalle.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dalle.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dalle-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dalle-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dalle-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dalle-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dalle-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dalle-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dalle-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dalle-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dalle-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dalle-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/dalle.webp"
        }
      }
    }
  },
  {
    "iconId": "dbrx",
    "componentId": "Dbrx",
    "docsUrl": "dbrx",
    "title": "DBRX",
    "fullTitle": "DBRX (Databricks)",
    "group": "model",
    "color": "#EE3D2C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dbrx.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dbrx.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dbrx.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dbrx.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dbrx.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dbrx-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dbrx-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dbrx-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dbrx-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dbrx-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dbrx-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dbrx-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dbrx-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dbrx-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dbrx-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dbrx-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dbrx-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dbrx-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dbrx-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dbrx-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dbrx-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dbrx-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dbrx-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dbrx-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dbrx-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/dbrx.webp"
        }
      }
    }
  },
  {
    "iconId": "deepai",
    "componentId": "DeepAI",
    "docsUrl": "deep-ai",
    "title": "DeepAI",
    "fullTitle": "DeepAI",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/deepai.webp"
        }
      }
    }
  },
  {
    "iconId": "deepcogito",
    "componentId": "DeepCogito",
    "docsUrl": "deep-cogito",
    "title": "Deep Cogito",
    "fullTitle": "Deep Cogito",
    "group": "model",
    "color": "#4e81ee",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepcogito.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepcogito.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepcogito.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepcogito.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepcogito.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepcogito-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepcogito-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepcogito-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepcogito-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepcogito-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepcogito-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepcogito-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepcogito-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepcogito-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepcogito-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/deepcogito.webp"
        }
      }
    }
  },
  {
    "iconId": "deepinfra",
    "componentId": "DeepInfra",
    "docsUrl": "deep-infra",
    "title": "DeepInfra",
    "fullTitle": "DeepInfra",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepinfra.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepinfra.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepinfra.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepinfra.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepinfra.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepinfra-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepinfra-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepinfra-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepinfra-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepinfra-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepinfra-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepinfra-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepinfra-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepinfra-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepinfra-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/deepinfra.webp"
        }
      }
    }
  },
  {
    "iconId": "deepl",
    "componentId": "DeepL",
    "docsUrl": "deep-l",
    "title": "DeepL",
    "fullTitle": "DeepL",
    "group": "application",
    "color": "#0F2B46",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepl.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepl.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepl.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepl.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepl.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepl-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepl-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepl-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepl-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepl-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepl-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepl-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepl-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepl-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepl-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/deepl.webp"
        }
      }
    }
  },
  {
    "iconId": "deepmind",
    "componentId": "DeepMind",
    "docsUrl": "deep-mind",
    "title": "DeepMind",
    "fullTitle": "DeepMind (Google)",
    "group": "provider",
    "color": "#4285F4",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepmind.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepmind.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepmind.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepmind.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepmind.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepmind-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepmind-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepmind-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepmind-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepmind-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepmind-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepmind-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepmind-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepmind-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepmind-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/deepmind.webp"
        }
      }
    }
  },
  {
    "iconId": "deepseek",
    "componentId": "DeepSeek",
    "docsUrl": "deep-seek",
    "title": "DeepSeek",
    "fullTitle": "DeepSeek",
    "group": "model",
    "color": "#4D6BFE",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepseek.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepseek.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepseek.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepseek.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepseek-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepseek-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepseek-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepseek-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/deepseek-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/deepseek-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/deepseek-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/deepseek-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/deepseek.webp"
        }
      }
    }
  },
  {
    "iconId": "dify",
    "componentId": "Dify",
    "docsUrl": "dify",
    "title": "Dify",
    "fullTitle": "Dify",
    "group": "application",
    "color": "#03F",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dify.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dify.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dify.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dify.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dify.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dify-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dify-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dify-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dify-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dify-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dify-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dify-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dify-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dify-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dify-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/dify.webp"
        }
      }
    }
  },
  {
    "iconId": "doc2x",
    "componentId": "Doc2X",
    "docsUrl": "doc2-x",
    "title": "Doc2X",
    "fullTitle": "Doc2X",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doc2x.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/doc2x.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/doc2x.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/doc2x.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/doc2x.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doc2x-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/doc2x-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/doc2x-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/doc2x-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/doc2x-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doc2x-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/doc2x-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/doc2x-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/doc2x-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/doc2x-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/doc2x.webp"
        }
      }
    }
  },
  {
    "iconId": "docsearch",
    "componentId": "DocSearch",
    "docsUrl": "doc-search",
    "title": "DocSearch",
    "fullTitle": "DocSearch",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/docsearch.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/docsearch.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/docsearch.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/docsearch.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/docsearch.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/docsearch-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/docsearch-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/docsearch-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/docsearch-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/docsearch-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/docsearch-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/docsearch-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/docsearch-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/docsearch-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/docsearch-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/docsearch.webp"
        }
      }
    }
  },
  {
    "iconId": "dolphin",
    "componentId": "Dolphin",
    "docsUrl": "dolphin",
    "title": "Dolphin",
    "fullTitle": "Dolphin (dphnAI)",
    "group": "model",
    "color": "#6186db",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dolphin.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dolphin.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dolphin.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dolphin.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dolphin.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dolphin-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dolphin-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dolphin-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dolphin-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dolphin-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/dolphin.webp"
        }
      }
    }
  },
  {
    "iconId": "doubao",
    "componentId": "Doubao",
    "docsUrl": "doubao",
    "title": "Doubao",
    "fullTitle": "Doubao (豆包)",
    "group": "model",
    "color": "#FFF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doubao.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/doubao.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/doubao.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/doubao.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/doubao.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doubao-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/doubao-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/doubao-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/doubao-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/doubao-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/doubao-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/doubao-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/doubao-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/doubao-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/doubao-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/doubao.webp"
        }
      }
    }
  },
  {
    "iconId": "dreammachine",
    "componentId": "DreamMachine",
    "docsUrl": "dream-machine",
    "title": "DreamMachine",
    "fullTitle": "DreamMachine (Luma)",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dreammachine.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dreammachine.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dreammachine.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dreammachine.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dreammachine.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/dreammachine-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/dreammachine-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/dreammachine-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/dreammachine-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/dreammachine-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/dreammachine.webp"
        }
      }
    }
  },
  {
    "iconId": "elevenlabs",
    "componentId": "ElevenLabs",
    "docsUrl": "eleven-labs",
    "title": "ElevenLabs",
    "fullTitle": "ElevenLabs",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/elevenlabs.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/elevenlabs.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/elevenlabs.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/elevenlabs.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/elevenlabs.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/elevenlabs-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/elevenlabs-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/elevenlabs-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/elevenlabs-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/elevenlabs-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/elevenlabs.webp"
        }
      }
    }
  },
  {
    "iconId": "elevenx",
    "componentId": "ElevenX",
    "docsUrl": "eleven-x",
    "title": "11x",
    "fullTitle": "11x",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/elevenx.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/elevenx.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/elevenx.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/elevenx.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/elevenx.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/elevenx-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/elevenx-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/elevenx-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/elevenx-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/elevenx-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/elevenx.webp"
        }
      }
    }
  },
  {
    "iconId": "essentialai",
    "componentId": "EssentialAI",
    "docsUrl": "essential-ai",
    "title": "Essential AI",
    "fullTitle": "Essential AI",
    "group": "model",
    "color": "#111322",
    "colorGradient": "linear-gradient(135deg, #5E38A5, #31018C 63%)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/essentialai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/essentialai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/essentialai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/essentialai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/essentialai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/essentialai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/essentialai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/essentialai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/essentialai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/essentialai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/essentialai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/essentialai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/essentialai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/essentialai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/essentialai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/essentialai.webp"
        }
      }
    }
  },
  {
    "iconId": "exa",
    "componentId": "Exa",
    "docsUrl": "exa",
    "title": "Exa",
    "fullTitle": "Exa",
    "group": "provider",
    "color": "#1f40ed",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/exa.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/exa.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/exa.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/exa.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/exa.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/exa-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/exa-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/exa-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/exa-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/exa-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/exa-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/exa-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/exa-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/exa-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/exa-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/exa.webp"
        }
      }
    }
  },
  {
    "iconId": "fal",
    "componentId": "Fal",
    "docsUrl": "fal",
    "title": "Fal",
    "fullTitle": "Fal",
    "group": "provider",
    "color": "#EC0648",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fal.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fal.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fal.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fal.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fal.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fal-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fal-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fal-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fal-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fal-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fal-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fal-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fal-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fal-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fal-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/fal.webp"
        }
      }
    }
  },
  {
    "iconId": "fastgpt",
    "componentId": "FastGPT",
    "docsUrl": "fast-gpt",
    "title": "FastGPT",
    "fullTitle": "FastGPT",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fastgpt.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fastgpt.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fastgpt.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fastgpt.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fastgpt.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fastgpt-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fastgpt-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fastgpt-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fastgpt-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fastgpt-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fastgpt-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fastgpt-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fastgpt-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fastgpt-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fastgpt-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/fastgpt.webp"
        }
      }
    }
  },
  {
    "iconId": "featherless",
    "componentId": "Featherless",
    "docsUrl": "featherless",
    "title": "featherless.ai",
    "fullTitle": "Featherless.ai",
    "group": "provider",
    "color": "#FFE184",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/featherless.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/featherless.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/featherless.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/featherless.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/featherless.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/featherless-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/featherless-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/featherless-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/featherless-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/featherless-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/featherless-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/featherless-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/featherless-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/featherless-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/featherless-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/featherless.webp"
        }
      }
    }
  },
  {
    "iconId": "figma",
    "componentId": "Figma",
    "docsUrl": "figma",
    "title": "Figma",
    "fullTitle": "Figma",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/figma.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/figma.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/figma.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/figma.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/figma.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/figma-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/figma-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/figma-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/figma-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/figma-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/figma-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/figma-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/figma-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/figma-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/figma-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/figma.webp"
        }
      }
    }
  },
  {
    "iconId": "fireworks",
    "componentId": "Fireworks",
    "docsUrl": "fireworks",
    "title": "Fireworks",
    "fullTitle": "Fireworks",
    "group": "provider",
    "color": "#5019C5",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fireworks.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fireworks.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fireworks.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fireworks.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fireworks.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fireworks-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fireworks-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fireworks-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fireworks-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fireworks-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fireworks-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fireworks-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fireworks-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fireworks-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fireworks-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/fireworks.webp"
        }
      }
    }
  },
  {
    "iconId": "fishaudio",
    "componentId": "FishAudio",
    "docsUrl": "fish-audio",
    "title": "FishAudio",
    "fullTitle": "FishAudio (Bert)",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fishaudio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fishaudio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fishaudio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fishaudio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fishaudio.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/fishaudio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/fishaudio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/fishaudio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/fishaudio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/fishaudio-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/fishaudio.webp"
        }
      }
    }
  },
  {
    "iconId": "flora",
    "componentId": "Flora",
    "docsUrl": "flora",
    "title": "Flora",
    "fullTitle": "Flora",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/flora.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/flora.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/flora.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/flora.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/flora.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/flora-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/flora-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/flora-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/flora-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/flora-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/flora.webp"
        }
      }
    }
  },
  {
    "iconId": "flowith",
    "componentId": "Flowith",
    "docsUrl": "flowith",
    "title": "Flowith",
    "fullTitle": "Flowith",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/flowith.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/flowith.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/flowith.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/flowith.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/flowith.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/flowith-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/flowith-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/flowith-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/flowith-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/flowith-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/flowith.webp"
        }
      }
    }
  },
  {
    "iconId": "flux",
    "componentId": "Flux",
    "docsUrl": "flux",
    "title": "Flux",
    "fullTitle": "Flux (black forest labs)",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/flux.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/flux.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/flux.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/flux.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/flux.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/flux-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/flux-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/flux-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/flux-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/flux-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/flux.webp"
        }
      }
    }
  },
  {
    "iconId": "friendli",
    "componentId": "Friendli",
    "docsUrl": "friendli",
    "title": "Friendli",
    "fullTitle": "Friendli",
    "group": "provider",
    "color": "#101723",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/friendli.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/friendli.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/friendli.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/friendli.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/friendli.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/friendli-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/friendli-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/friendli-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/friendli-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/friendli-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/friendli.webp"
        }
      }
    }
  },
  {
    "iconId": "gemini",
    "componentId": "Gemini",
    "docsUrl": "gemini",
    "title": "Gemini",
    "fullTitle": "Gemini (Google)",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemini.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemini.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gemini.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gemini.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gemini.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemini-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemini-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gemini-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gemini-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gemini-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemini-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemini-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gemini-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gemini-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gemini-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/gemini.webp"
        }
      }
    }
  },
  {
    "iconId": "geminicli",
    "componentId": "GeminiCLI",
    "docsUrl": "gemini-cli",
    "title": "Gemini CLI",
    "fullTitle": "Gemini CLI",
    "group": "application",
    "color": "#1E1E2E",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/geminicli.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/geminicli.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/geminicli.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/geminicli.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/geminicli.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/geminicli-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/geminicli-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/geminicli-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/geminicli-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/geminicli-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/geminicli-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/geminicli-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/geminicli-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/geminicli-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/geminicli-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/geminicli.webp"
        }
      }
    }
  },
  {
    "iconId": "gemma",
    "componentId": "Gemma",
    "docsUrl": "gemma",
    "title": "Gemma",
    "fullTitle": "Gemma (Google)",
    "group": "model",
    "color": "#2E96FF",
    "colorGradient": "linear-gradient(45deg, #446EFF 14%, #2E96FF 40%, #B1C5FF 73%)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemma.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemma.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gemma.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gemma.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gemma.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemma-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemma-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gemma-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gemma-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gemma-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemma-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gemma-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gemma-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gemma-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gemma-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/gemma.webp"
        }
      }
    }
  },
  {
    "iconId": "giteeai",
    "componentId": "GiteeAI",
    "docsUrl": "gitee-ai",
    "title": "GiteeAI",
    "fullTitle": "GiteeAI",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/giteeai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/giteeai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/giteeai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/giteeai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/giteeai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/giteeai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/giteeai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/giteeai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/giteeai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/giteeai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/giteeai.webp"
        }
      }
    }
  },
  {
    "iconId": "github",
    "componentId": "Github",
    "docsUrl": "github",
    "title": "Github",
    "fullTitle": "Github",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/github.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/github.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/github.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/github.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/github.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/github-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/github-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/github-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/github-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/github-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/github.webp"
        }
      }
    }
  },
  {
    "iconId": "githubcopilot",
    "componentId": "GithubCopilot",
    "docsUrl": "github-copilot",
    "title": "GithubCopilot",
    "fullTitle": "Github Copilot",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/githubcopilot.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/githubcopilot.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/githubcopilot.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/githubcopilot.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/githubcopilot.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/githubcopilot-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/githubcopilot-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/githubcopilot-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/githubcopilot-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/githubcopilot-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/githubcopilot.webp"
        }
      }
    }
  },
  {
    "iconId": "glama",
    "componentId": "Glama",
    "docsUrl": "glama",
    "title": "Glama",
    "fullTitle": "Glama",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glama.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glama.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glama.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glama.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glama.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glama-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glama-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glama-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glama-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glama-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/glama.webp"
        }
      }
    }
  },
  {
    "iconId": "glif",
    "componentId": "Glif",
    "docsUrl": "glif",
    "title": "Glif",
    "fullTitle": "Glif",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glif.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glif.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glif.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glif.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glif.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glif-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glif-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glif-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glif-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glif-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/glif.webp"
        }
      }
    }
  },
  {
    "iconId": "glmv",
    "componentId": "GLMV",
    "docsUrl": "glmv",
    "title": "GLM-V",
    "fullTitle": "GLM-V",
    "group": "model",
    "color": "#0039C6",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glmv.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glmv.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glmv.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glmv.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glmv.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glmv-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glmv-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glmv-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glmv-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glmv-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/glmv-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/glmv-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/glmv-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/glmv-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/glmv-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/glmv.webp"
        }
      }
    }
  },
  {
    "iconId": "google",
    "componentId": "Google",
    "docsUrl": "google",
    "title": "Google",
    "fullTitle": "Google",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": false,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/google.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/google.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/google.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/google.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/google.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/google-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/google-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/google-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/google-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/google-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/google-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/google-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/google-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/google-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/google-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/google-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/google-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/google-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/google-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/google-brand-color.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/google.webp"
        }
      }
    }
  },
  {
    "iconId": "googlecloud",
    "componentId": "GoogleCloud",
    "docsUrl": "google-cloud",
    "title": "GoogleCloud",
    "fullTitle": "GoogleCloud",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": false,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/googlecloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/googlecloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/googlecloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/googlecloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/googlecloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/googlecloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/googlecloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/googlecloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/googlecloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/googlecloud-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/googlecloud-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/googlecloud-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/googlecloud-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/googlecloud-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/googlecloud-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/googlecloud-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/googlecloud-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/googlecloud-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/googlecloud-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/googlecloud-brand-color.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/googlecloud.webp"
        }
      }
    }
  },
  {
    "iconId": "goose",
    "componentId": "Goose",
    "docsUrl": "goose",
    "title": "Goose",
    "fullTitle": "Goose (codename)",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/goose.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/goose.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/goose.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/goose.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/goose.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/goose-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/goose-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/goose-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/goose-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/goose-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/goose.webp"
        }
      }
    }
  },
  {
    "iconId": "gradio",
    "componentId": "Gradio",
    "docsUrl": "gradio",
    "title": "Gradio",
    "fullTitle": "Gradio",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gradio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gradio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gradio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gradio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gradio.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gradio-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gradio-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gradio-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gradio-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gradio-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gradio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/gradio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/gradio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/gradio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/gradio-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/gradio.webp"
        }
      }
    }
  },
  {
    "iconId": "greptile",
    "componentId": "Greptile",
    "docsUrl": "greptile",
    "title": "Greptile",
    "fullTitle": "Greptile",
    "group": "application",
    "color": "#44A775",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/greptile.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/greptile.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/greptile.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/greptile.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/greptile.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/greptile-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/greptile-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/greptile-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/greptile-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/greptile-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/greptile-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/greptile-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/greptile-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/greptile-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/greptile-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/greptile.webp"
        }
      }
    }
  },
  {
    "iconId": "grok",
    "componentId": "Grok",
    "docsUrl": "grok",
    "title": "Grok",
    "fullTitle": "Grok (xAI)",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/grok.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/grok.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/grok.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/grok.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/grok.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/grok-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/grok-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/grok-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/grok-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/grok-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/grok.webp"
        }
      }
    }
  },
  {
    "iconId": "groq",
    "componentId": "Groq",
    "docsUrl": "groq",
    "title": "Groq",
    "fullTitle": "Groq",
    "group": "provider",
    "color": "#F55036",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/groq.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/groq.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/groq.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/groq.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/groq.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/groq-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/groq-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/groq-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/groq-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/groq-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/groq.webp"
        }
      }
    }
  },
  {
    "iconId": "hailuo",
    "componentId": "Hailuo",
    "docsUrl": "hailuo",
    "title": "Hailuo",
    "fullTitle": "Hailuo (海螺)",
    "group": "application",
    "color": "#fff",
    "colorGradient": "linear-gradient(135deg, #FFAB0C, #FF5538, #E9405D, #D266DA, #D584EF)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hailuo.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hailuo.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hailuo.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hailuo.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hailuo.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hailuo-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hailuo-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hailuo-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hailuo-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hailuo-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hailuo-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hailuo-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hailuo-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hailuo-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hailuo-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/hailuo.webp"
        }
      }
    }
  },
  {
    "iconId": "haiper",
    "componentId": "Haiper",
    "docsUrl": "haiper",
    "title": "Haiper",
    "fullTitle": "Haiper",
    "group": "application",
    "color": "#9581ff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/haiper.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/haiper.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/haiper.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/haiper.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/haiper.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/haiper-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/haiper-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/haiper-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/haiper-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/haiper-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/haiper.webp"
        }
      }
    }
  },
  {
    "iconId": "hedra",
    "componentId": "Hedra",
    "docsUrl": "hedra",
    "title": "Hedra",
    "fullTitle": "Hedra",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hedra.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hedra.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hedra.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hedra.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hedra.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hedra-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hedra-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hedra-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hedra-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hedra-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/hedra.webp"
        }
      }
    }
  },
  {
    "iconId": "higress",
    "componentId": "Higress",
    "docsUrl": "higress",
    "title": "Higress",
    "fullTitle": "Higress",
    "group": "provider",
    "color": "#3E5CF4",
    "colorGradient": "linear-gradient(to bottom, #0418FF,  #1E8CFE)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/higress.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/higress.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/higress.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/higress.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/higress.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/higress-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/higress-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/higress-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/higress-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/higress-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/higress-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/higress-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/higress-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/higress-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/higress-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/higress.webp"
        }
      }
    }
  },
  {
    "iconId": "huawei",
    "componentId": "Huawei",
    "docsUrl": "huawei",
    "title": "Huawei",
    "fullTitle": "Huawei",
    "group": "provider",
    "color": "#C7000B",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huawei.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huawei.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huawei.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huawei.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huawei.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huawei-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huawei-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huawei-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huawei-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huawei-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huawei-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huawei-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huawei-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huawei-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huawei-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huawei-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huawei-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huawei-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huawei-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huawei-text-cn.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/huawei.webp"
        }
      }
    }
  },
  {
    "iconId": "huaweicloud",
    "componentId": "HuaweiCloud",
    "docsUrl": "huawei-cloud",
    "title": "HuaweiCloud",
    "fullTitle": "HuaweiCloud (华为云)",
    "group": "provider",
    "color": "#C7000B",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huaweicloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huaweicloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huaweicloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huaweicloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huaweicloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huaweicloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huaweicloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huaweicloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huaweicloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huaweicloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huaweicloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huaweicloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huaweicloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huaweicloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huaweicloud-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huaweicloud-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huaweicloud-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huaweicloud-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huaweicloud-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huaweicloud-text-cn.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/huaweicloud.webp"
        }
      }
    }
  },
  {
    "iconId": "huggingface",
    "componentId": "HuggingFace",
    "docsUrl": "hugging-face",
    "title": "HuggingFace",
    "fullTitle": "HuggingFace",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huggingface.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huggingface.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huggingface.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huggingface.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huggingface.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huggingface-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huggingface-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huggingface-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huggingface-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huggingface-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/huggingface-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/huggingface-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/huggingface-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/huggingface-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/huggingface-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/huggingface.webp"
        }
      }
    }
  },
  {
    "iconId": "hunyuan",
    "componentId": "Hunyuan",
    "docsUrl": "hunyuan",
    "title": "Hunyuan",
    "fullTitle": "Hunyuan (腾讯混元)",
    "group": "model",
    "color": "#0053e0",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hunyuan.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hunyuan.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hunyuan.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hunyuan.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hunyuan.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hunyuan-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hunyuan-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hunyuan-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hunyuan-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hunyuan-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hunyuan-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hunyuan-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hunyuan-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hunyuan-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hunyuan-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/hunyuan.webp"
        }
      }
    }
  },
  {
    "iconId": "hyperbolic",
    "componentId": "Hyperbolic",
    "docsUrl": "hyperbolic",
    "title": "Hyperbolic",
    "fullTitle": "Hyperbolic",
    "group": "provider",
    "color": "#594CE9",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hyperbolic.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hyperbolic.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hyperbolic.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hyperbolic.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hyperbolic.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hyperbolic-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hyperbolic-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hyperbolic-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hyperbolic-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hyperbolic-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/hyperbolic-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/hyperbolic-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/hyperbolic-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/hyperbolic-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/hyperbolic-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/hyperbolic.webp"
        }
      }
    }
  },
  {
    "iconId": "ibm",
    "componentId": "IBM",
    "docsUrl": "ibm",
    "title": "IBM",
    "fullTitle": "IBM (Granite)",
    "group": "provider",
    "color": "#0F62FE",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ibm.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ibm.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ibm.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ibm.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ibm.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ibm-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ibm-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ibm-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ibm-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ibm-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ibm.webp"
        }
      }
    }
  },
  {
    "iconId": "ideogram",
    "componentId": "Ideogram",
    "docsUrl": "ideogram",
    "title": "Ideogram",
    "fullTitle": "Ideogram",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ideogram.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ideogram.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ideogram.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ideogram.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ideogram.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ideogram-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ideogram-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ideogram-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ideogram-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ideogram-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ideogram.webp"
        }
      }
    }
  },
  {
    "iconId": "iflytekcloud",
    "componentId": "IFlyTekCloud",
    "docsUrl": "i-fly-tek-cloud",
    "title": "iFlyTekCloud",
    "fullTitle": "IFlyTekCloud (讯飞开放平台)",
    "group": "provider",
    "color": "#2A80E2",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/iflytekcloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/iflytekcloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/iflytekcloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/iflytekcloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/iflytekcloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/iflytekcloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/iflytekcloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/iflytekcloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/iflytekcloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/iflytekcloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/iflytekcloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/iflytekcloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/iflytekcloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/iflytekcloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/iflytekcloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/iflytekcloud.webp"
        }
      }
    }
  },
  {
    "iconId": "inception",
    "componentId": "Inception",
    "docsUrl": "inception",
    "title": "Inception",
    "fullTitle": "Inception Labs",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/inception.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/inception.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/inception.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/inception.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/inception.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/inception-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/inception-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/inception-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/inception-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/inception-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/inception.webp"
        }
      }
    }
  },
  {
    "iconId": "inference",
    "componentId": "Inference",
    "docsUrl": "inference",
    "title": "Inference",
    "fullTitle": "Inference",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/inference.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/inference.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/inference.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/inference.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/inference.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/inference-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/inference-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/inference-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/inference-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/inference-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/inference.webp"
        }
      }
    }
  },
  {
    "iconId": "infermatic",
    "componentId": "Infermatic",
    "docsUrl": "infermatic",
    "title": "Infermatic",
    "fullTitle": "Infermatic",
    "group": "provider",
    "color": "#4334F5",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infermatic.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infermatic.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infermatic.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infermatic.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infermatic.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infermatic-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infermatic-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infermatic-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infermatic-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infermatic-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infermatic-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infermatic-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infermatic-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infermatic-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infermatic-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/infermatic.webp"
        }
      }
    }
  },
  {
    "iconId": "infinigence",
    "componentId": "Infinigence",
    "docsUrl": "infinigence",
    "title": "Infinigence",
    "fullTitle": "Infinigence (无问芯穹)",
    "group": "provider",
    "color": "#7952ea",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infinigence.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infinigence.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infinigence.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infinigence.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infinigence.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infinigence-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infinigence-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infinigence-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infinigence-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infinigence-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infinigence-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infinigence-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infinigence-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infinigence-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infinigence-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/infinigence-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/infinigence-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/infinigence-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/infinigence-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/infinigence-text-cn.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/infinigence.webp"
        }
      }
    }
  },
  {
    "iconId": "inflection",
    "componentId": "Inflection",
    "docsUrl": "inflection",
    "title": "Inflection",
    "fullTitle": "Inflection",
    "group": "model",
    "color": "#038247",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/inflection.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/inflection.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/inflection.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/inflection.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/inflection.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/inflection-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/inflection-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/inflection-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/inflection-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/inflection-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/inflection.webp"
        }
      }
    }
  },
  {
    "iconId": "internlm",
    "componentId": "InternLM",
    "docsUrl": "intern-lm",
    "title": "InternLM",
    "fullTitle": "InternLM",
    "group": "provider",
    "color": "#1B3882",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/internlm.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/internlm.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/internlm.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/internlm.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/internlm.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/internlm-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/internlm-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/internlm-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/internlm-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/internlm-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/internlm-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/internlm-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/internlm-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/internlm-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/internlm-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/internlm.webp"
        }
      }
    }
  },
  {
    "iconId": "jimeng",
    "componentId": "Jimeng",
    "docsUrl": "jimeng",
    "title": "Jimeng",
    "fullTitle": "Jimeng (即梦)",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/jimeng.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/jimeng.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/jimeng.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/jimeng.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/jimeng.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/jimeng-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/jimeng-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/jimeng-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/jimeng-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/jimeng-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/jimeng-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/jimeng-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/jimeng-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/jimeng-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/jimeng-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/jimeng.webp"
        }
      }
    }
  },
  {
    "iconId": "jina",
    "componentId": "Jina",
    "docsUrl": "jina",
    "title": "Jina",
    "fullTitle": "Jina AI",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/jina.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/jina.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/jina.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/jina.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/jina.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/jina-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/jina-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/jina-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/jina-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/jina-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/jina.webp"
        }
      }
    }
  },
  {
    "iconId": "junie",
    "componentId": "Junie",
    "docsUrl": "junie",
    "title": "Junie",
    "fullTitle": "Junie",
    "group": "application",
    "color": "#47E054",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/junie.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/junie.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/junie.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/junie.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/junie.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/junie-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/junie-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/junie-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/junie-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/junie-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/junie-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/junie-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/junie-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/junie-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/junie-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/junie.webp"
        }
      }
    }
  },
  {
    "iconId": "kilocode",
    "componentId": "KiloCode",
    "docsUrl": "kilo-code",
    "title": "Kilo Code",
    "fullTitle": "Kilo Code",
    "group": "application",
    "color": "#F8F676",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kilocode.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kilocode.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kilocode.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kilocode.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kilocode.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kilocode-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kilocode-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kilocode-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kilocode-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kilocode-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kilocode.webp"
        }
      }
    }
  },
  {
    "iconId": "kimi",
    "componentId": "Kimi",
    "docsUrl": "kimi",
    "title": "Kimi",
    "fullTitle": "Kimi",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kimi.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kimi.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kimi.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kimi.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kimi.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kimi-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kimi-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kimi-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kimi-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kimi-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kimi-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kimi-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kimi-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kimi-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kimi-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kimi.webp"
        }
      }
    }
  },
  {
    "iconId": "kling",
    "componentId": "Kling",
    "docsUrl": "kling",
    "title": "Kling",
    "fullTitle": "Kling (可灵)",
    "group": "application",
    "color": "#000",
    "colorGradient": "linear-gradient(45deg, #FFF959, #0DF35E, #0BF2F9, #04A6F0)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kling.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kling.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kling.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kling.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kling.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kling-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kling-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kling-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kling-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kling-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kling-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kling-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kling-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kling-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kling-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kling.webp"
        }
      }
    }
  },
  {
    "iconId": "kluster",
    "componentId": "Kluster",
    "docsUrl": "kluster",
    "title": "Kluster",
    "fullTitle": "Kluster",
    "group": "provider",
    "color": "#6525F7",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kluster.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kluster.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kluster.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kluster.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kluster.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kluster-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kluster-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kluster-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kluster-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kluster-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kluster-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kluster-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kluster-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kluster-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kluster-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kluster.webp"
        }
      }
    }
  },
  {
    "iconId": "kolors",
    "componentId": "Kolors",
    "docsUrl": "kolors",
    "title": "Kolors",
    "fullTitle": "Kolors (快手可图)",
    "group": "model",
    "color": "#83FF63",
    "colorGradient": "radial-gradient(#CBFF00,#7EF426)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kolors.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kolors.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kolors.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kolors.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kolors.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kolors-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kolors-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kolors-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kolors-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kolors-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kolors-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kolors-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kolors-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kolors-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kolors-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kolors.webp"
        }
      }
    }
  },
  {
    "iconId": "krea",
    "componentId": "Krea",
    "docsUrl": "krea",
    "title": "Krea",
    "fullTitle": "Krea",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/krea.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/krea.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/krea.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/krea.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/krea.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/krea-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/krea-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/krea-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/krea-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/krea-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/krea.webp"
        }
      }
    }
  },
  {
    "iconId": "kwaikat",
    "componentId": "KwaiKAT",
    "docsUrl": "kwai-kat",
    "title": "KwaiKAT",
    "fullTitle": "KwaiKAT (KAT-Coder)",
    "group": "model",
    "color": "#0A67FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kwaikat.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kwaikat.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kwaikat.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kwaikat.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kwaikat.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kwaikat-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kwaikat-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kwaikat-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kwaikat-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kwaikat-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kwaikat.webp"
        }
      }
    }
  },
  {
    "iconId": "kwaipilot",
    "componentId": "Kwaipilot",
    "docsUrl": "kwaipilot",
    "title": "Kwaipilot",
    "fullTitle": "Kwaipilot",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kwaipilot.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kwaipilot.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kwaipilot.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kwaipilot.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kwaipilot.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kwaipilot-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kwaipilot-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kwaipilot-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kwaipilot-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kwaipilot-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/kwaipilot-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/kwaipilot-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/kwaipilot-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/kwaipilot-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/kwaipilot-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/kwaipilot.webp"
        }
      }
    }
  },
  {
    "iconId": "lambda",
    "componentId": "Lambda",
    "docsUrl": "lambda",
    "title": "Lambda",
    "fullTitle": "Lambda",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lambda.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lambda.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lambda.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lambda.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lambda.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lambda-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lambda-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lambda-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lambda-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lambda-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lambda.webp"
        }
      }
    }
  },
  {
    "iconId": "langchain",
    "componentId": "LangChain",
    "docsUrl": "lang-chain",
    "title": "LangChain",
    "fullTitle": "LangChain",
    "group": "application",
    "color": "#7FC8FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langchain.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langchain.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langchain.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langchain.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langchain.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langchain-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langchain-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langchain-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langchain-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langchain-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langchain-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langchain-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langchain-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langchain-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langchain-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/langchain.webp"
        }
      }
    }
  },
  {
    "iconId": "langfuse",
    "componentId": "Langfuse",
    "docsUrl": "langfuse",
    "title": "Langfuse",
    "fullTitle": "Langfuse",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langfuse.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langfuse.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langfuse.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langfuse.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langfuse.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langfuse-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langfuse-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langfuse-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langfuse-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langfuse-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langfuse-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langfuse-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langfuse-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langfuse-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langfuse-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/langfuse.webp"
        }
      }
    }
  },
  {
    "iconId": "langgraph",
    "componentId": "LangGraph",
    "docsUrl": "lang-graph",
    "title": "LangGraph",
    "fullTitle": "LangGraph (LangChain)",
    "group": "application",
    "color": "#1C3C3C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langgraph.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langgraph.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langgraph.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langgraph.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langgraph.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langgraph-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langgraph-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langgraph-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langgraph-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langgraph-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langgraph-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langgraph-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langgraph-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langgraph-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langgraph-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/langgraph.webp"
        }
      }
    }
  },
  {
    "iconId": "langsmith",
    "componentId": "LangSmith",
    "docsUrl": "lang-smith",
    "title": "LangSmith",
    "fullTitle": "LangSmith (LangChain)",
    "group": "application",
    "color": "#1C3C3C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langsmith.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langsmith.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langsmith.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langsmith.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langsmith.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langsmith-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langsmith-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langsmith-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langsmith-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langsmith-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/langsmith-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/langsmith-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/langsmith-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/langsmith-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/langsmith-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/langsmith.webp"
        }
      }
    }
  },
  {
    "iconId": "leptonai",
    "componentId": "LeptonAI",
    "docsUrl": "lepton-ai",
    "title": "LeptonAI",
    "fullTitle": "LeptonAI",
    "group": "provider",
    "color": "#2F80ED",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/leptonai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/leptonai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/leptonai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/leptonai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/leptonai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/leptonai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/leptonai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/leptonai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/leptonai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/leptonai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/leptonai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/leptonai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/leptonai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/leptonai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/leptonai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/leptonai.webp"
        }
      }
    }
  },
  {
    "iconId": "lg",
    "componentId": "LG",
    "docsUrl": "lg",
    "title": "LG AI",
    "fullTitle": "LG AI (KMMLU/EXAONE)",
    "group": "provider",
    "color": "#C00C3F",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lg.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lg.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lg.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lg.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lg.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lg-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lg-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lg-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lg-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lg-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lg-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lg-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lg-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lg-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lg-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lg.webp"
        }
      }
    }
  },
  {
    "iconId": "lightricks",
    "componentId": "Lightricks",
    "docsUrl": "lightricks",
    "title": "Lightricks",
    "fullTitle": "Lightricks",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lightricks.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lightricks.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lightricks.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lightricks.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lightricks.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lightricks-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lightricks-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lightricks-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lightricks-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lightricks-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lightricks.webp"
        }
      }
    }
  },
  {
    "iconId": "liquid",
    "componentId": "Liquid",
    "docsUrl": "liquid",
    "title": "Liquid",
    "fullTitle": "Liquid",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/liquid.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/liquid.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/liquid.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/liquid.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/liquid.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/liquid-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/liquid-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/liquid-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/liquid-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/liquid-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/liquid.webp"
        }
      }
    }
  },
  {
    "iconId": "livekit",
    "componentId": "LiveKit",
    "docsUrl": "live-kit",
    "title": "LiveKit",
    "fullTitle": "LiveKit",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/livekit.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/livekit.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/livekit.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/livekit.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/livekit.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/livekit-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/livekit-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/livekit-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/livekit-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/livekit-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/livekit-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/livekit-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/livekit-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/livekit-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/livekit-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/livekit.webp"
        }
      }
    }
  },
  {
    "iconId": "llamaindex",
    "componentId": "LlamaIndex",
    "docsUrl": "llama-index",
    "title": "LlamaIndex",
    "fullTitle": "LlamaIndex",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llamaindex.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llamaindex.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llamaindex.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llamaindex.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llamaindex.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llamaindex-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llamaindex-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llamaindex-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llamaindex-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llamaindex-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llamaindex-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llamaindex-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llamaindex-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llamaindex-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llamaindex-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/llamaindex.webp"
        }
      }
    }
  },
  {
    "iconId": "llava",
    "componentId": "LLaVA",
    "docsUrl": "l-la-va",
    "title": "LLaVA",
    "fullTitle": "LLaVA",
    "group": "model",
    "color": "#CB2D30",
    "colorGradient": "linear-gradient(-45deg, #CB2D30, #ED823A)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llava.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llava.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llava.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llava.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llava.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llava-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llava-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llava-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llava-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llava-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llava-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llava-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llava-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llava-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llava-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/llava.webp"
        }
      }
    }
  },
  {
    "iconId": "llmapi",
    "componentId": "LlmApi",
    "docsUrl": "llm-api",
    "title": "LLM API",
    "fullTitle": "LLM API",
    "group": "provider",
    "color": "#3F35FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llmapi.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llmapi.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llmapi.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llmapi.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llmapi.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llmapi-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llmapi-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llmapi-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llmapi-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llmapi-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/llmapi-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/llmapi-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/llmapi-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/llmapi-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/llmapi-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/llmapi.webp"
        }
      }
    }
  },
  {
    "iconId": "lmstudio",
    "componentId": "LmStudio",
    "docsUrl": "lm-studio",
    "title": "LM Studio",
    "fullTitle": "LM Studio",
    "group": "provider",
    "color": "#4338CA",
    "colorGradient": "linear-gradient(135deg, #6C78EF, #4F14BE)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lmstudio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lmstudio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lmstudio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lmstudio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lmstudio.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lmstudio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lmstudio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lmstudio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lmstudio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lmstudio-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lmstudio.webp"
        }
      }
    }
  },
  {
    "iconId": "lobehub",
    "componentId": "LobeHub",
    "docsUrl": "lobe-hub",
    "title": "LobeHub",
    "fullTitle": "LobeHub",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lobehub.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lobehub.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lobehub.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lobehub.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lobehub.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lobehub-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lobehub-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lobehub-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lobehub-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lobehub-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lobehub-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lobehub-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lobehub-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lobehub-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lobehub-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lobehub.webp"
        }
      }
    }
  },
  {
    "iconId": "longcat",
    "componentId": "LongCat",
    "docsUrl": "long-cat",
    "title": "LongCat",
    "fullTitle": "LongCat",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/longcat.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/longcat.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/longcat.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/longcat.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/longcat.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/longcat-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/longcat-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/longcat-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/longcat-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/longcat-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/longcat-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/longcat-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/longcat-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/longcat-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/longcat-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/longcat.webp"
        }
      }
    }
  },
  {
    "iconId": "lovable",
    "componentId": "Lovable",
    "docsUrl": "lovable",
    "title": "Lovable",
    "fullTitle": "Lovable",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lovable.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lovable.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lovable.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lovable.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lovable.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lovable-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lovable-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lovable-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lovable-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lovable-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lovable-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lovable-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lovable-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lovable-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lovable-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lovable.webp"
        }
      }
    }
  },
  {
    "iconId": "lovart",
    "componentId": "Lovart",
    "docsUrl": "lovart",
    "title": "Lovart",
    "fullTitle": "Lovart",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lovart.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lovart.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lovart.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lovart.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lovart.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/lovart-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/lovart-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/lovart-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/lovart-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/lovart-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/lovart.webp"
        }
      }
    }
  },
  {
    "iconId": "luma",
    "componentId": "Luma",
    "docsUrl": "luma",
    "title": "Luma",
    "fullTitle": "Luma",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/luma.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/luma.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/luma.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/luma.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/luma.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/luma-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/luma-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/luma-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/luma-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/luma-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/luma-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/luma-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/luma-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/luma-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/luma-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/luma.webp"
        }
      }
    }
  },
  {
    "iconId": "magic",
    "componentId": "Magic",
    "docsUrl": "magic",
    "title": "Magic",
    "fullTitle": "Magic",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/magic.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/magic.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/magic.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/magic.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/magic.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/magic-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/magic-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/magic-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/magic-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/magic-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/magic.webp"
        }
      }
    }
  },
  {
    "iconId": "make",
    "componentId": "Make",
    "docsUrl": "make",
    "title": "Make",
    "fullTitle": "Make",
    "group": "application",
    "color": "#ff009a",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/make.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/make.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/make.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/make.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/make.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/make-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/make-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/make-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/make-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/make-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/make-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/make-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/make-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/make-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/make-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/make.webp"
        }
      }
    }
  },
  {
    "iconId": "manus",
    "componentId": "Manus",
    "docsUrl": "manus",
    "title": "Manus",
    "fullTitle": "Manus",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/manus.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/manus.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/manus.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/manus.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/manus.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/manus-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/manus-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/manus-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/manus-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/manus-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/manus.webp"
        }
      }
    }
  },
  {
    "iconId": "mastra",
    "componentId": "Mastra",
    "docsUrl": "mastra",
    "title": "Mastra",
    "fullTitle": "Mastra",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mastra.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mastra.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mastra.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mastra.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mastra.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mastra-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mastra-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mastra-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mastra-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mastra-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/mastra.webp"
        }
      }
    }
  },
  {
    "iconId": "mcp",
    "componentId": "MCP",
    "docsUrl": "mcp",
    "title": "ModelContextProtocol",
    "fullTitle": "MCP (Model Context Protocol)",
    "group": "application",
    "color": "#FFF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mcp.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mcp.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mcp.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mcp.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mcp.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mcp-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mcp-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mcp-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mcp-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mcp-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/mcp.webp"
        }
      }
    }
  },
  {
    "iconId": "mcpso",
    "componentId": "McpSo",
    "docsUrl": "mcp-so",
    "title": "MCP.so",
    "fullTitle": "MCP.so",
    "group": "application",
    "color": "#1C3F6B",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mcpso.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mcpso.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mcpso.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mcpso.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mcpso.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mcpso-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mcpso-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mcpso-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mcpso-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mcpso-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mcpso-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mcpso-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mcpso-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mcpso-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mcpso-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/mcpso.webp"
        }
      }
    }
  },
  {
    "iconId": "menlo",
    "componentId": "Menlo",
    "docsUrl": "menlo",
    "title": "MENLO",
    "fullTitle": "MENLO (Lucy/Jan-nano)",
    "group": "provider",
    "color": "#FF5C00",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/menlo.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/menlo.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/menlo.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/menlo.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/menlo.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/menlo-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/menlo-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/menlo-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/menlo-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/menlo-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/menlo.webp"
        }
      }
    }
  },
  {
    "iconId": "meta",
    "componentId": "Meta",
    "docsUrl": "meta",
    "title": "Meta",
    "fullTitle": "Meta",
    "group": "provider",
    "color": "#1d65c1",
    "colorGradient": "linear-gradient(45deg, #007FF8, #0668E1, #007FF8)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/meta.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/meta.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/meta.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/meta.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/meta.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/meta-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/meta-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/meta-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/meta-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/meta-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/meta-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/meta-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/meta-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/meta-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/meta-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/meta-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/meta-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/meta-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/meta-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/meta-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/meta-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/meta-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/meta-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/meta-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/meta-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/meta.webp"
        }
      }
    }
  },
  {
    "iconId": "metaai",
    "componentId": "MetaAI",
    "docsUrl": "meta-ai",
    "title": "MetaAI",
    "fullTitle": "MetaAI",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/metaai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/metaai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/metaai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/metaai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/metaai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/metaai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/metaai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/metaai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/metaai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/metaai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/metaai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/metaai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/metaai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/metaai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/metaai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/metaai.webp"
        }
      }
    }
  },
  {
    "iconId": "metagpt",
    "componentId": "MetaGPT",
    "docsUrl": "meta-gpt",
    "title": "MetaGPT",
    "fullTitle": "MetaGPT",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/metagpt.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/metagpt.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/metagpt.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/metagpt.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/metagpt.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/metagpt-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/metagpt-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/metagpt-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/metagpt-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/metagpt-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/metagpt.webp"
        }
      }
    }
  },
  {
    "iconId": "microsoft",
    "componentId": "Microsoft",
    "docsUrl": "microsoft",
    "title": "Azure",
    "fullTitle": "Microsoft",
    "group": "provider",
    "color": "#00A4EF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/microsoft.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/microsoft.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/microsoft.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/microsoft.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/microsoft.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/microsoft-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/microsoft-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/microsoft-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/microsoft-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/microsoft-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/microsoft-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/microsoft-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/microsoft-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/microsoft-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/microsoft-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/microsoft.webp"
        }
      }
    }
  },
  {
    "iconId": "midjourney",
    "componentId": "Midjourney",
    "docsUrl": "midjourney",
    "title": "Midjourney",
    "fullTitle": "Midjourney",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/midjourney.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/midjourney.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/midjourney.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/midjourney.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/midjourney.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/midjourney-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/midjourney-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/midjourney-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/midjourney-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/midjourney-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/midjourney.webp"
        }
      }
    }
  },
  {
    "iconId": "minimax",
    "componentId": "Minimax",
    "docsUrl": "minimax",
    "title": "Minimax",
    "fullTitle": "Minimax",
    "group": "model",
    "color": "#F23F5D",
    "colorGradient": "linear-gradient(to right, #E2167E,  #FE603C)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/minimax.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/minimax.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/minimax.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/minimax.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/minimax.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/minimax-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/minimax-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/minimax-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/minimax-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/minimax-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/minimax-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/minimax-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/minimax-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/minimax-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/minimax-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/minimax.webp"
        }
      }
    }
  },
  {
    "iconId": "mistral",
    "componentId": "Mistral",
    "docsUrl": "mistral",
    "title": "Mistral",
    "fullTitle": "Mistral",
    "group": "model",
    "color": "#FA520F",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mistral.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mistral.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mistral.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mistral.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mistral.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mistral-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mistral-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mistral-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mistral-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mistral-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mistral-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/mistral-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/mistral-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/mistral-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/mistral-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/mistral.webp"
        }
      }
    }
  },
  {
    "iconId": "modelscope",
    "componentId": "ModelScope",
    "docsUrl": "model-scope",
    "title": "ModelScope",
    "fullTitle": "ModelScope (魔搭)",
    "group": "provider",
    "color": "#624AFF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/modelscope.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/modelscope.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/modelscope.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/modelscope.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/modelscope.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/modelscope-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/modelscope-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/modelscope-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/modelscope-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/modelscope-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/modelscope-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/modelscope-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/modelscope-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/modelscope-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/modelscope-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/modelscope.webp"
        }
      }
    }
  },
  {
    "iconId": "monica",
    "componentId": "Monica",
    "docsUrl": "monica",
    "title": "Monica",
    "fullTitle": "Monica",
    "group": "application",
    "color": "#6841ea",
    "colorGradient": "linear-gradient(90deg, #A83FE0, #515FFB, #2BB5DD)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/monica.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/monica.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/monica.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/monica.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/monica.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/monica-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/monica-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/monica-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/monica-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/monica-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/monica-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/monica-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/monica-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/monica-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/monica-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/monica.webp"
        }
      }
    }
  },
  {
    "iconId": "moonshot",
    "componentId": "Moonshot",
    "docsUrl": "moonshot",
    "title": "MoonshotAI",
    "fullTitle": "Moonshot (月之暗面)",
    "group": "provider",
    "color": "#16191E",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/moonshot.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/moonshot.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/moonshot.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/moonshot.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/moonshot.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/moonshot-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/moonshot-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/moonshot-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/moonshot-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/moonshot-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/moonshot.webp"
        }
      }
    }
  },
  {
    "iconId": "morph",
    "componentId": "Morph",
    "docsUrl": "morph",
    "title": "Morph",
    "fullTitle": "Morph",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/morph.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/morph.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/morph.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/morph.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/morph.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/morph-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/morph-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/morph-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/morph-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/morph-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/morph-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/morph-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/morph-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/morph-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/morph-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/morph.webp"
        }
      }
    }
  },
  {
    "iconId": "myshell",
    "componentId": "MyShell",
    "docsUrl": "my-shell",
    "title": "MyShell",
    "fullTitle": "MyShell",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/myshell.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/myshell.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/myshell.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/myshell.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/myshell.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/myshell-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/myshell-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/myshell-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/myshell-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/myshell-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/myshell-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/myshell-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/myshell-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/myshell-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/myshell-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/myshell.webp"
        }
      }
    }
  },
  {
    "iconId": "n8n",
    "componentId": "N8n",
    "docsUrl": "n-8-n",
    "title": "n8n",
    "fullTitle": "n8n",
    "group": "application",
    "color": "#EA4B71",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/n8n.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/n8n.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/n8n.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/n8n.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/n8n.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/n8n-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/n8n-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/n8n-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/n8n-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/n8n-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/n8n-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/n8n-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/n8n-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/n8n-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/n8n-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/n8n.webp"
        }
      }
    }
  },
  {
    "iconId": "nanobanana",
    "componentId": "NanoBanana",
    "docsUrl": "nano-banana",
    "title": "NanoBanana",
    "fullTitle": "Nano Banana (Google)",
    "group": "model",
    "color": "#FCD53F",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nanobanana.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nanobanana.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nanobanana.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nanobanana.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nanobanana.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nanobanana-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nanobanana-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nanobanana-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nanobanana-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nanobanana-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nanobanana-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nanobanana-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nanobanana-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nanobanana-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nanobanana-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/nanobanana.webp"
        }
      }
    }
  },
  {
    "iconId": "nebius",
    "componentId": "Nebius",
    "docsUrl": "nebius",
    "title": "Nebius",
    "fullTitle": "Nebius",
    "group": "provider",
    "color": "#DAFF33",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nebius.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nebius.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nebius.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nebius.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nebius.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nebius-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nebius-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nebius-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nebius-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nebius-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/nebius.webp"
        }
      }
    }
  },
  {
    "iconId": "newapi",
    "componentId": "NewAPI",
    "docsUrl": "new-api",
    "title": "New API",
    "fullTitle": "New API",
    "group": "provider",
    "color": "#dd2e57",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/newapi.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/newapi.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/newapi.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/newapi.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/newapi.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/newapi-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/newapi-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/newapi-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/newapi-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/newapi-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/newapi-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/newapi-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/newapi-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/newapi-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/newapi-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/newapi.webp"
        }
      }
    }
  },
  {
    "iconId": "notebooklm",
    "componentId": "NotebookLM",
    "docsUrl": "notebook-lm",
    "title": "NotebookLM",
    "fullTitle": "NotebookLM",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/notebooklm.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/notebooklm.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/notebooklm.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/notebooklm.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/notebooklm.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/notebooklm-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/notebooklm-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/notebooklm-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/notebooklm-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/notebooklm-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/notebooklm.webp"
        }
      }
    }
  },
  {
    "iconId": "notion",
    "componentId": "Notion",
    "docsUrl": "notion",
    "title": "Notion",
    "fullTitle": "Notion",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/notion.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/notion.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/notion.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/notion.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/notion.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/notion-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/notion-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/notion-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/notion-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/notion-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/notion.webp"
        }
      }
    }
  },
  {
    "iconId": "nousresearch",
    "componentId": "NousResearch",
    "docsUrl": "nous-research",
    "title": "NousResearch",
    "fullTitle": "NousResearch (Hermes)",
    "group": "provider",
    "color": "#2D6376",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nousresearch.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nousresearch.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nousresearch.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nousresearch.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nousresearch.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nousresearch-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nousresearch-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nousresearch-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nousresearch-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nousresearch-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/nousresearch.webp"
        }
      }
    }
  },
  {
    "iconId": "nova",
    "componentId": "Nova",
    "docsUrl": "nova",
    "title": "Nova",
    "fullTitle": "Nova (AWS)",
    "group": "model",
    "color": "#222F3E",
    "colorGradient": "linear-gradient(-45deg, #ff6200, #e433ff 39.9%, #6842ff 96%)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nova.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nova.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nova.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nova.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nova.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nova-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nova-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nova-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nova-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nova-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nova-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nova-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nova-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nova-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nova-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/nova.webp"
        }
      }
    }
  },
  {
    "iconId": "novelai",
    "componentId": "NovelAI",
    "docsUrl": "novel-ai",
    "title": "NovelAI",
    "fullTitle": "NovelAI",
    "group": "application",
    "color": "#E1E4FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/novelai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/novelai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/novelai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/novelai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/novelai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/novelai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/novelai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/novelai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/novelai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/novelai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/novelai.webp"
        }
      }
    }
  },
  {
    "iconId": "novita",
    "componentId": "Novita",
    "docsUrl": "novita",
    "title": "Novita AI",
    "fullTitle": "Novita",
    "group": "provider",
    "color": "#23D57C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/novita.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/novita.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/novita.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/novita.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/novita.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/novita-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/novita-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/novita-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/novita-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/novita-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/novita-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/novita-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/novita-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/novita-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/novita-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/novita.webp"
        }
      }
    }
  },
  {
    "iconId": "nplcloud",
    "componentId": "NPLCloud",
    "docsUrl": "npl-cloud",
    "title": "NPLCloud",
    "fullTitle": "NPLCloud",
    "group": "provider",
    "color": "#00D1B2",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nplcloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nplcloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nplcloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nplcloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nplcloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nplcloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nplcloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nplcloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nplcloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nplcloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nplcloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nplcloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nplcloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nplcloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nplcloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/nplcloud.webp"
        }
      }
    }
  },
  {
    "iconId": "nvidia",
    "componentId": "Nvidia",
    "docsUrl": "nvidia",
    "title": "Nvidia",
    "fullTitle": "Nvidia (Nemotron)",
    "group": "provider",
    "color": "#74B71B",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nvidia.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nvidia.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nvidia.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nvidia.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nvidia.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nvidia-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nvidia-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nvidia-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nvidia-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nvidia-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/nvidia-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/nvidia-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/nvidia-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/nvidia-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/nvidia-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/nvidia.webp"
        }
      }
    }
  },
  {
    "iconId": "obsidian",
    "componentId": "Obsidian",
    "docsUrl": "obsidian",
    "title": "Obsidian",
    "fullTitle": "Obsidian",
    "group": "application",
    "color": "#A88BFA",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/obsidian.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/obsidian.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/obsidian.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/obsidian.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/obsidian.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/obsidian-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/obsidian-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/obsidian-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/obsidian-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/obsidian-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/obsidian-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/obsidian-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/obsidian-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/obsidian-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/obsidian-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/obsidian.webp"
        }
      }
    }
  },
  {
    "iconId": "ollama",
    "componentId": "Ollama",
    "docsUrl": "ollama",
    "title": "Ollama",
    "fullTitle": "Ollama",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ollama.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ollama.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ollama.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ollama.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ollama.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ollama-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ollama-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ollama-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ollama-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ollama-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ollama.webp"
        }
      }
    }
  },
  {
    "iconId": "openai",
    "componentId": "OpenAI",
    "docsUrl": "open-ai",
    "title": "OpenAI",
    "fullTitle": "OpenAI (ChatGPT)",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openai.webp"
        }
      }
    }
  },
  {
    "iconId": "openchat",
    "componentId": "OpenChat",
    "docsUrl": "open-chat",
    "title": "OpenChat",
    "fullTitle": "OpenChat",
    "group": "model",
    "color": "#4A7FE3",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openchat.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openchat.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openchat.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openchat.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openchat.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openchat-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openchat-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openchat-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openchat-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openchat-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openchat-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openchat-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openchat-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openchat-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openchat-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openchat.webp"
        }
      }
    }
  },
  {
    "iconId": "openclaw",
    "componentId": "OpenClaw",
    "docsUrl": "open-claw",
    "title": "OpenClaw",
    "fullTitle": "OpenClaw (MoltBot/ClawdBot)",
    "group": "application",
    "color": "#ff4d4d",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openclaw.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openclaw.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openclaw.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openclaw.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openclaw.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openclaw-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openclaw-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openclaw-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openclaw-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openclaw-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openclaw-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openclaw-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openclaw-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openclaw-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openclaw-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openclaw.webp"
        }
      }
    }
  },
  {
    "iconId": "opencode",
    "componentId": "OpenCode",
    "docsUrl": "open-code",
    "title": "opencode",
    "fullTitle": "opencode",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/opencode.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/opencode.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/opencode.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/opencode.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/opencode.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/opencode-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/opencode-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/opencode-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/opencode-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/opencode-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/opencode.webp"
        }
      }
    }
  },
  {
    "iconId": "openhands",
    "componentId": "OpenHands",
    "docsUrl": "open-hands",
    "title": "OpenHands",
    "fullTitle": "OpenHands",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openhands.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openhands.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openhands.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openhands.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openhands.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openhands-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openhands-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openhands-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openhands-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openhands-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openhands-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openhands-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openhands-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openhands-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openhands-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openhands.webp"
        }
      }
    }
  },
  {
    "iconId": "openrouter",
    "componentId": "OpenRouter",
    "docsUrl": "open-router",
    "title": "OpenRouter",
    "fullTitle": "OpenRouter",
    "group": "provider",
    "color": "#6566F1",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openrouter.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openrouter.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openrouter.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openrouter.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openrouter.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openrouter-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openrouter-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openrouter-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openrouter-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openrouter-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openrouter.webp"
        }
      }
    }
  },
  {
    "iconId": "openwebui",
    "componentId": "OpenWebUI",
    "docsUrl": "open-web-ui",
    "title": "OpenWebUI",
    "fullTitle": "OpenWebUI",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openwebui.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openwebui.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openwebui.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openwebui.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openwebui.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openwebui-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/openwebui-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/openwebui-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/openwebui-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/openwebui-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/openwebui.webp"
        }
      }
    }
  },
  {
    "iconId": "palm",
    "componentId": "PaLM",
    "docsUrl": "pa-lm",
    "title": "PaLM",
    "fullTitle": "PaLM (Google)",
    "group": "model",
    "color": "#FFF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/palm.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/palm.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/palm.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/palm.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/palm.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/palm-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/palm-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/palm-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/palm-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/palm-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/palm-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/palm-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/palm-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/palm-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/palm-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/palm.webp"
        }
      }
    }
  },
  {
    "iconId": "parasail",
    "componentId": "Parasail",
    "docsUrl": "parasail",
    "title": "Parasail",
    "fullTitle": "Parasail",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/parasail.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/parasail.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/parasail.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/parasail.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/parasail.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/parasail-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/parasail-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/parasail-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/parasail-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/parasail-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/parasail.webp"
        }
      }
    }
  },
  {
    "iconId": "perplexity",
    "componentId": "Perplexity",
    "docsUrl": "perplexity",
    "title": "Perplexity",
    "fullTitle": "Perplexity",
    "group": "provider",
    "color": "#22B8CD",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/perplexity.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/perplexity.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/perplexity.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/perplexity.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/perplexity.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/perplexity-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/perplexity-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/perplexity-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/perplexity-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/perplexity-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/perplexity-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/perplexity-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/perplexity-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/perplexity-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/perplexity-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/perplexity.webp"
        }
      }
    }
  },
  {
    "iconId": "phidata",
    "componentId": "Phidata",
    "docsUrl": "phidata",
    "title": "Phidata",
    "fullTitle": "Phidata",
    "group": "application",
    "color": "#FF4017",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/phidata.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/phidata.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/phidata.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/phidata.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/phidata.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/phidata-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/phidata-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/phidata-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/phidata-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/phidata-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/phidata-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/phidata-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/phidata-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/phidata-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/phidata-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/phidata.webp"
        }
      }
    }
  },
  {
    "iconId": "phind",
    "componentId": "Phind",
    "docsUrl": "phind",
    "title": "phind",
    "fullTitle": "Phind",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/phind.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/phind.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/phind.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/phind.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/phind.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/phind-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/phind-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/phind-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/phind-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/phind-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/phind.webp"
        }
      }
    }
  },
  {
    "iconId": "pika",
    "componentId": "Pika",
    "docsUrl": "pika",
    "title": "Pika",
    "fullTitle": "Pika",
    "group": "application",
    "color": "#FDF7EF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pika.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pika.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pika.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pika.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pika.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pika-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pika-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pika-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pika-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pika-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/pika.webp"
        }
      }
    }
  },
  {
    "iconId": "pixverse",
    "componentId": "PixVerse",
    "docsUrl": "pix-verse",
    "title": "PixVerse",
    "fullTitle": "PixVerse",
    "group": "application",
    "color": "#9727ef",
    "colorGradient": "linear-gradient(45deg, #3961f1, #9727ef, #ff601a)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pixverse.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pixverse.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pixverse.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pixverse.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pixverse.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pixverse-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pixverse-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pixverse-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pixverse-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pixverse-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pixverse-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pixverse-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pixverse-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pixverse-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pixverse-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/pixverse.webp"
        }
      }
    }
  },
  {
    "iconId": "player2",
    "componentId": "Player2",
    "docsUrl": "player2",
    "title": "Player2",
    "fullTitle": "Player2",
    "group": "application",
    "color": "#A8A6FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/player2.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/player2.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/player2.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/player2.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/player2.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/player2-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/player2-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/player2-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/player2-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/player2-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/player2-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/player2-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/player2-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/player2-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/player2-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/player2.webp"
        }
      }
    }
  },
  {
    "iconId": "poe",
    "componentId": "Poe",
    "docsUrl": "poe",
    "title": "Poe",
    "fullTitle": "Poe",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/poe.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/poe.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/poe.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/poe.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/poe.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/poe-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/poe-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/poe-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/poe-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/poe-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/poe-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/poe-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/poe-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/poe-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/poe-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/poe.webp"
        }
      }
    }
  },
  {
    "iconId": "pollinations",
    "componentId": "Pollinations",
    "docsUrl": "pollinations",
    "title": "Pollinations",
    "fullTitle": "Pollinations",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pollinations.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pollinations.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pollinations.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pollinations.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pollinations.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pollinations-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pollinations-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pollinations-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pollinations-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pollinations-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/pollinations.webp"
        }
      }
    }
  },
  {
    "iconId": "ppio",
    "componentId": "PPIO",
    "docsUrl": "ppio",
    "title": "PPIO",
    "fullTitle": "PPIO",
    "group": "provider",
    "color": "#2874ff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ppio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ppio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ppio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ppio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ppio.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ppio-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ppio-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ppio-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ppio-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ppio-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ppio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ppio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ppio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ppio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ppio-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ppio-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/ppio-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/ppio-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/ppio-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/ppio-text-cn.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/ppio.webp"
        }
      }
    }
  },
  {
    "iconId": "prunaai",
    "componentId": "PrunaAI",
    "docsUrl": "pruna-ai",
    "title": "PrunaAI",
    "fullTitle": "Pruna AI",
    "group": "model",
    "color": "#AC51FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/prunaai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/prunaai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/prunaai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/prunaai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/prunaai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/prunaai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/prunaai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/prunaai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/prunaai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/prunaai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/prunaai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/prunaai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/prunaai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/prunaai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/prunaai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/prunaai.webp"
        }
      }
    }
  },
  {
    "iconId": "pydanticai",
    "componentId": "PydanticAI",
    "docsUrl": "pydantic-ai",
    "title": "PydanticAI",
    "fullTitle": "PydanticAI",
    "group": "application",
    "color": "#E92063",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pydanticai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pydanticai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pydanticai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pydanticai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pydanticai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pydanticai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pydanticai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pydanticai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pydanticai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pydanticai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/pydanticai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/pydanticai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/pydanticai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/pydanticai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/pydanticai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/pydanticai.webp"
        }
      }
    }
  },
  {
    "iconId": "qingyan",
    "componentId": "Qingyan",
    "docsUrl": "qingyan",
    "title": "Qingyan",
    "fullTitle": "Qingyan (智谱清言)",
    "group": "application",
    "color": "#1041F3",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qingyan.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qingyan.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qingyan.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qingyan.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qingyan.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qingyan-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qingyan-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qingyan-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qingyan-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qingyan-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qingyan-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qingyan-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qingyan-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qingyan-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qingyan-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/qingyan.webp"
        }
      }
    }
  },
  {
    "iconId": "qiniu",
    "componentId": "Qiniu",
    "docsUrl": "qiniu",
    "title": "Qiniu",
    "fullTitle": "Qiniu (七牛云)",
    "group": "provider",
    "color": "#06AEEF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qiniu.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qiniu.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qiniu.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qiniu.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qiniu.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qiniu-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qiniu-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qiniu-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qiniu-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qiniu-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qiniu-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qiniu-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qiniu-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qiniu-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qiniu-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/qiniu.webp"
        }
      }
    }
  },
  {
    "iconId": "qoder",
    "componentId": "Qoder",
    "docsUrl": "qoder",
    "title": "Qoder",
    "fullTitle": "Qoder",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qoder.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qoder.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qoder.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qoder.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qoder.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qoder-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qoder-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qoder-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qoder-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qoder-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qoder-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qoder-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qoder-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qoder-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qoder-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/qoder.webp"
        }
      }
    }
  },
  {
    "iconId": "qwen",
    "componentId": "Qwen",
    "docsUrl": "qwen",
    "title": "Qwen",
    "fullTitle": "Qwen (千问)",
    "group": "model",
    "color": "#615ced",
    "colorGradient": "linear-gradient(to right, #6336E7,  #6F69F7)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qwen.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qwen.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qwen.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qwen.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qwen.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qwen-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qwen-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qwen-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qwen-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qwen-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qwen-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/qwen-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/qwen-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/qwen-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/qwen-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/qwen.webp"
        }
      }
    }
  },
  {
    "iconId": "railway",
    "componentId": "Railway",
    "docsUrl": "railway",
    "title": "Railway",
    "fullTitle": "Railway",
    "group": "application",
    "color": "#853bce",
    "colorGradient": "linear-gradient(to bottom, #A204B4, #6213B9)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/railway.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/railway.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/railway.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/railway.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/railway.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/railway-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/railway-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/railway-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/railway-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/railway-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/railway.webp"
        }
      }
    }
  },
  {
    "iconId": "recraft",
    "componentId": "Recraft",
    "docsUrl": "recraft",
    "title": "Recraft",
    "fullTitle": "Recraft",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/recraft.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/recraft.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/recraft.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/recraft.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/recraft.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/recraft-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/recraft-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/recraft-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/recraft-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/recraft-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/recraft.webp"
        }
      }
    }
  },
  {
    "iconId": "relace",
    "componentId": "Relace",
    "docsUrl": "relace",
    "title": "Relace",
    "fullTitle": "Relace",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/relace.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/relace.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/relace.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/relace.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/relace.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/relace-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/relace-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/relace-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/relace-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/relace-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/relace.webp"
        }
      }
    }
  },
  {
    "iconId": "replicate",
    "componentId": "Replicate",
    "docsUrl": "replicate",
    "title": "Replicate",
    "fullTitle": "Replicate",
    "group": "provider",
    "color": "#EA2805",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/replicate.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/replicate.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/replicate.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/replicate.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/replicate.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/replicate-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/replicate-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/replicate-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/replicate-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/replicate-brand.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/replicate-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/replicate-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/replicate-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/replicate-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/replicate-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/replicate.webp"
        }
      }
    }
  },
  {
    "iconId": "replit",
    "componentId": "Replit",
    "docsUrl": "replit",
    "title": "Replit",
    "fullTitle": "Replit",
    "group": "application",
    "color": "#FD5402",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/replit.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/replit.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/replit.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/replit.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/replit.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/replit-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/replit-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/replit-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/replit-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/replit-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/replit-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/replit-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/replit-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/replit-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/replit-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/replit.webp"
        }
      }
    }
  },
  {
    "iconId": "reve",
    "componentId": "Reve",
    "docsUrl": "reve",
    "title": "Reve",
    "fullTitle": "Reve",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/reve.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/reve.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/reve.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/reve.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/reve.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/reve-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/reve-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/reve-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/reve-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/reve-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/reve.webp"
        }
      }
    }
  },
  {
    "iconId": "roocode",
    "componentId": "RooCode",
    "docsUrl": "roo-code",
    "title": "RooCode",
    "fullTitle": "RooCode",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/roocode.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/roocode.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/roocode.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/roocode.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/roocode.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/roocode-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/roocode-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/roocode-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/roocode-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/roocode-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/roocode.webp"
        }
      }
    }
  },
  {
    "iconId": "rsshub",
    "componentId": "RSSHub",
    "docsUrl": "rss-hub",
    "title": "RSSHub",
    "fullTitle": "RSSHub",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/rsshub.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/rsshub.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/rsshub.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/rsshub.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/rsshub.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/rsshub-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/rsshub-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/rsshub-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/rsshub-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/rsshub-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/rsshub-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/rsshub-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/rsshub-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/rsshub-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/rsshub-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/rsshub.webp"
        }
      }
    }
  },
  {
    "iconId": "runway",
    "componentId": "Runway",
    "docsUrl": "runway",
    "title": "Runway",
    "fullTitle": "Runway",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/runway.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/runway.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/runway.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/runway.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/runway.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/runway-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/runway-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/runway-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/runway-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/runway-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/runway.webp"
        }
      }
    }
  },
  {
    "iconId": "rwkv",
    "componentId": "Rwkv",
    "docsUrl": "rwkv",
    "title": "RWKV",
    "fullTitle": "RWKV",
    "group": "model",
    "color": "#3431C3",
    "colorGradient": "linear-gradient(to left, #1D1A5C, #3431C3, #7361F7)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/rwkv.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/rwkv.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/rwkv.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/rwkv.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/rwkv.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/rwkv-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/rwkv-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/rwkv-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/rwkv-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/rwkv-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/rwkv-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/rwkv-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/rwkv-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/rwkv-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/rwkv-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/rwkv.webp"
        }
      }
    }
  },
  {
    "iconId": "sambanova",
    "componentId": "SambaNova",
    "docsUrl": "samba-nova",
    "title": "SambaNova",
    "fullTitle": "SambaNova",
    "group": "provider",
    "color": "#EE7624",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sambanova.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sambanova.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sambanova.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sambanova.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sambanova.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sambanova-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sambanova-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sambanova-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sambanova-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sambanova-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sambanova-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sambanova-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sambanova-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sambanova-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sambanova-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/sambanova.webp"
        }
      }
    }
  },
  {
    "iconId": "search1api",
    "componentId": "Search1API",
    "docsUrl": "search1-api",
    "title": "Search1API",
    "fullTitle": "Search1API",
    "group": "provider",
    "color": "#0066FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/search1api.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/search1api.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/search1api.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/search1api.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/search1api.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/search1api-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/search1api-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/search1api-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/search1api-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/search1api-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/search1api-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/search1api-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/search1api-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/search1api-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/search1api-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/search1api.webp"
        }
      }
    }
  },
  {
    "iconId": "searchapi",
    "componentId": "SearchApi",
    "docsUrl": "search-api",
    "title": "SearchApi",
    "fullTitle": "SearchApi",
    "group": "provider",
    "color": "#4f46e5",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/searchapi.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/searchapi.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/searchapi.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/searchapi.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/searchapi.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/searchapi-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/searchapi-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/searchapi-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/searchapi-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/searchapi-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/searchapi.webp"
        }
      }
    }
  },
  {
    "iconId": "sensenova",
    "componentId": "SenseNova",
    "docsUrl": "sense-nova",
    "title": "SenseNova",
    "fullTitle": "SenseNova (商汤)",
    "group": "model",
    "color": "#5B2AD8",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sensenova.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sensenova.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sensenova.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sensenova.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sensenova.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sensenova-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sensenova-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sensenova-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sensenova-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sensenova-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sensenova-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sensenova-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sensenova-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sensenova-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sensenova-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sensenova-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sensenova-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sensenova-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sensenova-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sensenova-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sensenova-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sensenova-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sensenova-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sensenova-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sensenova-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/sensenova.webp"
        }
      }
    }
  },
  {
    "iconId": "siliconcloud",
    "componentId": "SiliconCloud",
    "docsUrl": "silicon-cloud",
    "title": "SiliconCloud",
    "fullTitle": "SiliconCloud (SiliconFlow)",
    "group": "provider",
    "color": "#6E29F6",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/siliconcloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/siliconcloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/siliconcloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/siliconcloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/siliconcloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/siliconcloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/siliconcloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/siliconcloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/siliconcloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/siliconcloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/siliconcloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/siliconcloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/siliconcloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/siliconcloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/siliconcloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/siliconcloud.webp"
        }
      }
    }
  },
  {
    "iconId": "skywork",
    "componentId": "Skywork",
    "docsUrl": "skywork",
    "title": "Skywork",
    "fullTitle": "Skywork (天工)",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/skywork.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/skywork.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/skywork.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/skywork.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/skywork.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/skywork-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/skywork-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/skywork-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/skywork-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/skywork-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/skywork-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/skywork-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/skywork-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/skywork-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/skywork-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/skywork.webp"
        }
      }
    }
  },
  {
    "iconId": "smithery",
    "componentId": "Smithery",
    "docsUrl": "smithery",
    "title": "Smithery",
    "fullTitle": "Smithery",
    "group": "application",
    "color": "#EA580C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/smithery.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/smithery.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/smithery.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/smithery.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/smithery.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/smithery-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/smithery-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/smithery-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/smithery-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/smithery-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/smithery-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/smithery-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/smithery-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/smithery-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/smithery-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/smithery.webp"
        }
      }
    }
  },
  {
    "iconId": "snowflake",
    "componentId": "Snowflake",
    "docsUrl": "snowflake",
    "title": "Snowflake",
    "fullTitle": "Snowflake",
    "group": "provider",
    "color": "#249EDC",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/snowflake.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/snowflake.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/snowflake.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/snowflake.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/snowflake.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/snowflake-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/snowflake-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/snowflake-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/snowflake-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/snowflake-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/snowflake-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/snowflake-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/snowflake-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/snowflake-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/snowflake-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/snowflake.webp"
        }
      }
    }
  },
  {
    "iconId": "sophnet",
    "componentId": "SophNet",
    "docsUrl": "soph-net",
    "title": "SophNet",
    "fullTitle": "SophNet",
    "group": "provider",
    "color": "#6200ee",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sophnet.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sophnet.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sophnet.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sophnet.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sophnet.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sophnet-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sophnet-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sophnet-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sophnet-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sophnet-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sophnet-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sophnet-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sophnet-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sophnet-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sophnet-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/sophnet.webp"
        }
      }
    }
  },
  {
    "iconId": "sora",
    "componentId": "Sora",
    "docsUrl": "sora",
    "title": "Sora",
    "fullTitle": "Sora (OpenAI)",
    "group": "model",
    "color": "#0968DA",
    "colorGradient": "linear-gradient(180deg, #012659 0%, #0968DA 100%)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sora.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sora.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sora.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sora.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sora.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sora-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sora-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sora-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sora-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sora-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sora-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sora-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sora-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sora-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sora-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/sora.webp"
        }
      }
    }
  },
  {
    "iconId": "spark",
    "componentId": "Spark",
    "docsUrl": "spark",
    "title": "Spark",
    "fullTitle": "Spark (讯飞星火)",
    "group": "model",
    "color": "#0070f0",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/spark.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/spark.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/spark.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/spark.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/spark.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/spark-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/spark-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/spark-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/spark-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/spark-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/spark-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/spark-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/spark-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/spark-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/spark-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/spark.webp"
        }
      }
    }
  },
  {
    "iconId": "stability",
    "componentId": "Stability",
    "docsUrl": "stability",
    "title": "Stability",
    "fullTitle": "Stability (StableDiffusion)",
    "group": "provider",
    "color": "#330066",
    "colorGradient": "linear-gradient(to bottom, #9D39FF,  #A380FF)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stability.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stability.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stability.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stability.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stability.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stability-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stability-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stability-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stability-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stability-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stability-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stability-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stability-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stability-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stability-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stability-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stability-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stability-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stability-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stability-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stability-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stability-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stability-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stability-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stability-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/stability.webp"
        }
      }
    }
  },
  {
    "iconId": "statecloud",
    "componentId": "StateCloud",
    "docsUrl": "state-cloud",
    "title": "StateCloud",
    "fullTitle": "StateCloud (天翼云)",
    "group": "provider",
    "color": "#DF0428",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/statecloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/statecloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/statecloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/statecloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/statecloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/statecloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/statecloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/statecloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/statecloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/statecloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/statecloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/statecloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/statecloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/statecloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/statecloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/statecloud.webp"
        }
      }
    }
  },
  {
    "iconId": "stepfun",
    "componentId": "Stepfun",
    "docsUrl": "stepfun",
    "title": "Stepfun",
    "fullTitle": "Stepfun (阶跃星辰)",
    "group": "model",
    "color": "#005AFF",
    "colorGradient": "linear-gradient(-45deg, #0160FF, #01A9FF)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stepfun.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stepfun.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stepfun.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stepfun.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stepfun.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stepfun-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stepfun-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stepfun-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stepfun-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stepfun-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/stepfun-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/stepfun-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/stepfun-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/stepfun-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/stepfun-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/stepfun.webp"
        }
      }
    }
  },
  {
    "iconId": "straico",
    "componentId": "Straico",
    "docsUrl": "straico",
    "title": "Straico",
    "fullTitle": "Straico",
    "group": "provider",
    "color": "#464bba",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/straico.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/straico.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/straico.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/straico.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/straico.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/straico-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/straico-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/straico-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/straico-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/straico-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/straico-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/straico-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/straico-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/straico-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/straico-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/straico.webp"
        }
      }
    }
  },
  {
    "iconId": "streamlake",
    "componentId": "StreamLake",
    "docsUrl": "stream-lake",
    "title": "StreamLake",
    "fullTitle": "StreamLake",
    "group": "provider",
    "color": "#1D70FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/streamlake.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/streamlake.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/streamlake.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/streamlake.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/streamlake.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/streamlake-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/streamlake-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/streamlake-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/streamlake-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/streamlake-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/streamlake-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/streamlake-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/streamlake-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/streamlake-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/streamlake-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/streamlake.webp"
        }
      }
    }
  },
  {
    "iconId": "submodel",
    "componentId": "SubModel",
    "docsUrl": "sub-model",
    "title": "SubModel",
    "fullTitle": "SubModel",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/submodel.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/submodel.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/submodel.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/submodel.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/submodel.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/submodel-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/submodel-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/submodel-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/submodel-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/submodel-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/submodel-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/submodel-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/submodel-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/submodel-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/submodel-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/submodel.webp"
        }
      }
    }
  },
  {
    "iconId": "suno",
    "componentId": "Suno",
    "docsUrl": "suno",
    "title": "Suno",
    "fullTitle": "Suno",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/suno.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/suno.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/suno.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/suno.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/suno.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/suno-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/suno-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/suno-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/suno-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/suno-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/suno.webp"
        }
      }
    }
  },
  {
    "iconId": "sync",
    "componentId": "Sync",
    "docsUrl": "sync",
    "title": "Sync",
    "fullTitle": "Sync",
    "group": "application",
    "color": "#0000FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sync.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sync.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sync.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sync.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sync.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/sync-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/sync-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/sync-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/sync-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/sync-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/sync.webp"
        }
      }
    }
  },
  {
    "iconId": "targon",
    "componentId": "Targon",
    "docsUrl": "targon",
    "title": "Targon",
    "fullTitle": "Targon",
    "group": "provider",
    "color": "#68C3FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/targon.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/targon.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/targon.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/targon.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/targon.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/targon-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/targon-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/targon-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/targon-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/targon-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/targon-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/targon-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/targon-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/targon-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/targon-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/targon.webp"
        }
      }
    }
  },
  {
    "iconId": "tavily",
    "componentId": "Tavily",
    "docsUrl": "tavily",
    "title": "Tavily",
    "fullTitle": "Tavily",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tavily.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tavily.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tavily.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tavily.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tavily.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tavily-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tavily-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tavily-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tavily-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tavily-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tavily-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tavily-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tavily-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tavily-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tavily-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/tavily.webp"
        }
      }
    }
  },
  {
    "iconId": "tencent",
    "componentId": "Tencent",
    "docsUrl": "tencent",
    "title": "Tencent",
    "fullTitle": "Tencent",
    "group": "provider",
    "color": "#0052D9",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": true,
      "hasBrandColor": true,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": true,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencent.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencent.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencent.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencent.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencent.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencent-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencent-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencent-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencent-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencent-color.webp"
          }
        }
      },
      "brand": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencent-brand.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencent-brand.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencent-brand.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencent-brand.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencent-brand.webp"
          }
        }
      },
      "brand-color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencent-brand-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencent-brand-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencent-brand-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencent-brand-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencent-brand-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencent-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencent-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencent-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencent-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencent-text.webp"
          }
        }
      },
      "text-cn": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencent-text-cn.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencent-text-cn.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencent-text-cn.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencent-text-cn.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencent-text-cn.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/tencent.webp"
        }
      }
    }
  },
  {
    "iconId": "tencentcloud",
    "componentId": "TencentCloud",
    "docsUrl": "tencent-cloud",
    "title": "TencentCloud",
    "fullTitle": "TencentCloud (腾讯云)",
    "group": "provider",
    "color": "#2151d1",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencentcloud.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencentcloud.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencentcloud.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencentcloud.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencentcloud.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencentcloud-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencentcloud-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencentcloud-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencentcloud-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencentcloud-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tencentcloud-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tencentcloud-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tencentcloud-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tencentcloud-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tencentcloud-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/tencentcloud.webp"
        }
      }
    }
  },
  {
    "iconId": "tiangong",
    "componentId": "Tiangong",
    "docsUrl": "tiangong",
    "title": "Tiangong",
    "fullTitle": "Tiangong (天工)",
    "group": "application",
    "color": "#0057ff",
    "colorGradient": "linear-gradient(to right, #6865FC, #467DF9)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tiangong.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tiangong.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tiangong.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tiangong.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tiangong.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tiangong-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tiangong-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tiangong-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tiangong-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tiangong-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tiangong-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tiangong-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tiangong-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tiangong-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tiangong-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/tiangong.webp"
        }
      }
    }
  },
  {
    "iconId": "tii",
    "componentId": "TII",
    "docsUrl": "tii",
    "title": "Technology Innovation Institute",
    "fullTitle": "Technology Innovation Institute (Falcon)",
    "group": "provider",
    "color": "#6400FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tii.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tii.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tii.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tii.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tii.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tii-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tii-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tii-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tii-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tii-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tii-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tii-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tii-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tii-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tii-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/tii.webp"
        }
      }
    }
  },
  {
    "iconId": "together",
    "componentId": "Together",
    "docsUrl": "together",
    "title": "together.ai",
    "fullTitle": "together.ai",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/together.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/together.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/together.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/together.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/together.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/together-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/together-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/together-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/together-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/together-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/together-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/together-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/together-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/together-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/together-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/together.webp"
        }
      }
    }
  },
  {
    "iconId": "topazlabs",
    "componentId": "TopazLabs",
    "docsUrl": "topaz-labs",
    "title": "TopazLabs",
    "fullTitle": "TopazLabs",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/topazlabs.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/topazlabs.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/topazlabs.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/topazlabs.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/topazlabs.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/topazlabs-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/topazlabs-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/topazlabs-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/topazlabs-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/topazlabs-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/topazlabs.webp"
        }
      }
    }
  },
  {
    "iconId": "trae",
    "componentId": "Trae",
    "docsUrl": "trae",
    "title": "TRAE",
    "fullTitle": "TRAE",
    "group": "application",
    "color": "#32F08C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/trae.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/trae.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/trae.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/trae.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/trae.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/trae-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/trae-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/trae-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/trae-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/trae-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/trae-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/trae-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/trae-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/trae-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/trae-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/trae.webp"
        }
      }
    }
  },
  {
    "iconId": "tripo",
    "componentId": "Tripo",
    "docsUrl": "tripo",
    "title": "Tripo",
    "fullTitle": "Tripo",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tripo.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tripo.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tripo.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tripo.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tripo.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tripo-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tripo-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tripo-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tripo-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tripo-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/tripo-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/tripo-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/tripo-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/tripo-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/tripo-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/tripo.webp"
        }
      }
    }
  },
  {
    "iconId": "turix",
    "componentId": "TuriX",
    "docsUrl": "turi-x",
    "title": "TuriX",
    "fullTitle": "TuriX",
    "group": "application",
    "color": "#F7AD8A",
    "colorGradient": "linear-gradient(-45deg, #FAD076, #F7AD8A, #C768B9)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/turix.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/turix.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/turix.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/turix.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/turix.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/turix-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/turix-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/turix-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/turix-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/turix-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/turix.webp"
        }
      }
    }
  },
  {
    "iconId": "udio",
    "componentId": "Udio",
    "docsUrl": "udio",
    "title": "Udio",
    "fullTitle": "Udio",
    "group": "application",
    "color": "#e30a5d",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/udio.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/udio.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/udio.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/udio.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/udio.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/udio-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/udio-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/udio-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/udio-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/udio-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/udio-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/udio-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/udio-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/udio-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/udio-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/udio.webp"
        }
      }
    }
  },
  {
    "iconId": "unstructured",
    "componentId": "Unstructured",
    "docsUrl": "unstructured",
    "title": "Unstructured",
    "fullTitle": "Unstructured",
    "group": "application",
    "color": "#0ADDF8",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/unstructured.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/unstructured.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/unstructured.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/unstructured.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/unstructured.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/unstructured-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/unstructured-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/unstructured-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/unstructured-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/unstructured-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/unstructured-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/unstructured-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/unstructured-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/unstructured-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/unstructured-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/unstructured.webp"
        }
      }
    }
  },
  {
    "iconId": "upstage",
    "componentId": "Upstage",
    "docsUrl": "upstage",
    "title": "Upsate",
    "fullTitle": "Upstage",
    "group": "provider",
    "color": "#908AF9",
    "colorGradient": "linear-gradient(to bottom, #AEBCFE,  #805DFA)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/upstage.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/upstage.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/upstage.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/upstage.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/upstage.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/upstage-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/upstage-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/upstage-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/upstage-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/upstage-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/upstage-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/upstage-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/upstage-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/upstage-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/upstage-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/upstage.webp"
        }
      }
    }
  },
  {
    "iconId": "v0",
    "componentId": "V0",
    "docsUrl": "v-0",
    "title": "V0",
    "fullTitle": "V0 (Vercel)",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": false,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/v0.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/v0.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/v0.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/v0.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/v0.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/v0.webp"
        }
      }
    }
  },
  {
    "iconId": "vectorizerai",
    "componentId": "VectorizerAI",
    "docsUrl": "vectorizer-ai",
    "title": "Vectorizer.AI",
    "fullTitle": "Vectorizer.AI",
    "group": "application",
    "color": "#3659FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vectorizerai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vectorizerai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vectorizerai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vectorizerai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vectorizerai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vectorizerai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vectorizerai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vectorizerai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vectorizerai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vectorizerai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/vectorizerai.webp"
        }
      }
    }
  },
  {
    "iconId": "vercel",
    "componentId": "Vercel",
    "docsUrl": "vercel",
    "title": "Vercel",
    "fullTitle": "Vercel",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vercel.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vercel.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vercel.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vercel.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vercel.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vercel-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vercel-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vercel-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vercel-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vercel-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/vercel.webp"
        }
      }
    }
  },
  {
    "iconId": "vertexai",
    "componentId": "VertexAI",
    "docsUrl": "vertex-ai",
    "title": "VertexAI",
    "fullTitle": "VertexAI (Google)",
    "group": "provider",
    "color": "#4285F4",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vertexai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vertexai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vertexai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vertexai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vertexai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vertexai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vertexai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vertexai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vertexai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vertexai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vertexai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vertexai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vertexai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vertexai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vertexai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/vertexai.webp"
        }
      }
    }
  },
  {
    "iconId": "vidu",
    "componentId": "Vidu",
    "docsUrl": "vidu",
    "title": "Vidu",
    "fullTitle": "Vidu",
    "group": "application",
    "color": "#22D5FF",
    "colorGradient": "linear-gradient(to right, #40EDD8, #22D5FF, #047FFE)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vidu.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vidu.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vidu.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vidu.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vidu.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vidu-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vidu-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vidu-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vidu-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vidu-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vidu-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vidu-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vidu-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vidu-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vidu-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/vidu.webp"
        }
      }
    }
  },
  {
    "iconId": "viggle",
    "componentId": "Viggle",
    "docsUrl": "viggle",
    "title": "Viggle",
    "fullTitle": "Viggle",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/viggle.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/viggle.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/viggle.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/viggle.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/viggle.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/viggle-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/viggle-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/viggle-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/viggle-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/viggle-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/viggle.webp"
        }
      }
    }
  },
  {
    "iconId": "vllm",
    "componentId": "Vllm",
    "docsUrl": "vllm",
    "title": "vLLM",
    "fullTitle": "vLLM",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vllm.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vllm.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vllm.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vllm.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vllm.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vllm-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vllm-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vllm-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vllm-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vllm-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/vllm-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/vllm-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/vllm-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/vllm-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/vllm-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/vllm.webp"
        }
      }
    }
  },
  {
    "iconId": "volcengine",
    "componentId": "Volcengine",
    "docsUrl": "volcengine",
    "title": "Volcengine",
    "fullTitle": "Volcengine (火山引擎)",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/volcengine.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/volcengine.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/volcengine.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/volcengine.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/volcengine.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/volcengine-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/volcengine-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/volcengine-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/volcengine-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/volcengine-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/volcengine-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/volcengine-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/volcengine-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/volcengine-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/volcengine-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/volcengine.webp"
        }
      }
    }
  },
  {
    "iconId": "voyage",
    "componentId": "Voyage",
    "docsUrl": "voyage",
    "title": "Voyage",
    "fullTitle": "Voyage",
    "group": "model",
    "color": "#012E33",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/voyage.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/voyage.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/voyage.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/voyage.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/voyage.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/voyage-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/voyage-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/voyage-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/voyage-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/voyage-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/voyage-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/voyage-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/voyage-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/voyage-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/voyage-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/voyage.webp"
        }
      }
    }
  },
  {
    "iconId": "wenxin",
    "componentId": "Wenxin",
    "docsUrl": "wenxin",
    "title": "Wenxin",
    "fullTitle": "Wenxin (文心)",
    "group": "model",
    "color": "#167ADF",
    "colorGradient": "linear-gradient(to right, #0A51C3,  #23A4FB)",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/wenxin.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/wenxin.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/wenxin.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/wenxin.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/wenxin.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/wenxin-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/wenxin-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/wenxin-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/wenxin-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/wenxin-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/wenxin-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/wenxin-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/wenxin-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/wenxin-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/wenxin-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/wenxin.webp"
        }
      }
    }
  },
  {
    "iconId": "windsurf",
    "componentId": "Windsurf",
    "docsUrl": "windsurf",
    "title": "Windsurf",
    "fullTitle": "Windsurf",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/windsurf.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/windsurf.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/windsurf.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/windsurf.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/windsurf.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/windsurf-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/windsurf-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/windsurf-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/windsurf-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/windsurf-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/windsurf.webp"
        }
      }
    }
  },
  {
    "iconId": "workersai",
    "componentId": "WorkersAI",
    "docsUrl": "workers-ai",
    "title": "WorkersAI",
    "fullTitle": "WorkersAI (Cloudflare)",
    "group": "provider",
    "color": "#F38020",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/workersai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/workersai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/workersai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/workersai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/workersai.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/workersai-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/workersai-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/workersai-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/workersai-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/workersai-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/workersai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/workersai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/workersai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/workersai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/workersai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/workersai.webp"
        }
      }
    }
  },
  {
    "iconId": "xai",
    "componentId": "XAI",
    "docsUrl": "xai",
    "title": "Grok",
    "fullTitle": "xAI",
    "group": "provider",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/xai.webp"
        }
      }
    }
  },
  {
    "iconId": "xiaomimimo",
    "componentId": "XiaomiMiMo",
    "docsUrl": "xiaomi-mi-mo",
    "title": "XiaomiMiMo",
    "fullTitle": "Xiaomi MiMo",
    "group": "model",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xiaomimimo.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xiaomimimo.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xiaomimimo.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xiaomimimo.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xiaomimimo.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xiaomimimo-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xiaomimimo-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xiaomimimo-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xiaomimimo-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xiaomimimo-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/xiaomimimo.webp"
        }
      }
    }
  },
  {
    "iconId": "xinference",
    "componentId": "Xinference",
    "docsUrl": "xinference",
    "title": "Xinference",
    "fullTitle": "Xinference",
    "group": "provider",
    "color": "#781ff5",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xinference.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xinference.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xinference.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xinference.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xinference.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xinference-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xinference-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xinference-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xinference-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xinference-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xinference-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xinference-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xinference-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xinference-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xinference-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/xinference.webp"
        }
      }
    }
  },
  {
    "iconId": "xpay",
    "componentId": "Xpay",
    "docsUrl": "xpay",
    "title": "xpay",
    "fullTitle": "Xpay",
    "group": "provider",
    "color": "#0F1C4D",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xpay.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xpay.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xpay.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xpay.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xpay.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xpay-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xpay-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xpay-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xpay-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xpay-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xpay-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xpay-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xpay-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xpay-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xpay-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/xpay.webp"
        }
      }
    }
  },
  {
    "iconId": "xuanyuan",
    "componentId": "Xuanyuan",
    "docsUrl": "xuanyuan",
    "title": "轩辕",
    "fullTitle": "Xuanyuan (度小满轩辕)",
    "group": "model",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xuanyuan.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xuanyuan.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xuanyuan.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xuanyuan.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xuanyuan.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xuanyuan-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xuanyuan-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xuanyuan-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xuanyuan-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xuanyuan-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/xuanyuan-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/xuanyuan-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/xuanyuan-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/xuanyuan-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/xuanyuan-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/xuanyuan.webp"
        }
      }
    }
  },
  {
    "iconId": "yandex",
    "componentId": "Yandex",
    "docsUrl": "yandex",
    "title": "Yandex",
    "fullTitle": "Yandex",
    "group": "provider",
    "color": "#FB3E1C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": false,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yandex.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yandex.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yandex.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yandex.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yandex.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yandex-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yandex-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yandex-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yandex-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yandex-text.webp"
          }
        }
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/yandex.webp"
        }
      }
    }
  },
  {
    "iconId": "yi",
    "componentId": "Yi",
    "docsUrl": "yi",
    "title": "Yi",
    "fullTitle": "Yi (零一万物)",
    "group": "model",
    "color": "#003425",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yi.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yi.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yi.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yi.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yi.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yi-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yi-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yi-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yi-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yi-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yi-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yi-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yi-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yi-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yi-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/yi.webp"
        }
      }
    }
  },
  {
    "iconId": "youmind",
    "componentId": "YouMind",
    "docsUrl": "you-mind",
    "title": "YouMind",
    "fullTitle": "YouMind",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/youmind.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/youmind.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/youmind.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/youmind.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/youmind.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/youmind-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/youmind-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/youmind-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/youmind-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/youmind-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/youmind.webp"
        }
      }
    }
  },
  {
    "iconId": "yuanbao",
    "componentId": "Yuanbao",
    "docsUrl": "yuanbao",
    "title": "Yuanbao",
    "fullTitle": "Yuanbao (腾讯元宝)",
    "group": "application",
    "color": "#fff",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yuanbao.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yuanbao.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yuanbao.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yuanbao.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yuanbao.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yuanbao-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yuanbao-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yuanbao-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yuanbao-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yuanbao-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/yuanbao-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/yuanbao-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/yuanbao-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/yuanbao-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/yuanbao-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/yuanbao.webp"
        }
      }
    }
  },
  {
    "iconId": "zai",
    "componentId": "ZAI",
    "docsUrl": "zai",
    "title": "Z.ai",
    "fullTitle": "Z.ai",
    "group": "application",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zai.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zai.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zai.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zai.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zai.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zai-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zai-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zai-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zai-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zai-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zai.webp"
        }
      }
    }
  },
  {
    "iconId": "zapier",
    "componentId": "Zapier",
    "docsUrl": "zapier",
    "title": "Zapier",
    "fullTitle": "Zapier",
    "group": "application",
    "color": "#FF4F00",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zapier.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zapier.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zapier.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zapier.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zapier.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zapier-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zapier-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zapier-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zapier-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zapier-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zapier-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zapier-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zapier-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zapier-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zapier-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zapier.webp"
        }
      }
    }
  },
  {
    "iconId": "zeabur",
    "componentId": "Zeabur",
    "docsUrl": "zeabur",
    "title": "Zeabur",
    "fullTitle": "Zeabur",
    "group": "application",
    "color": "#6300FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zeabur.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zeabur.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zeabur.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zeabur.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zeabur.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zeabur-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zeabur-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zeabur-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zeabur-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zeabur-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zeabur-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zeabur-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zeabur-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zeabur-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zeabur-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zeabur.webp"
        }
      }
    }
  },
  {
    "iconId": "zencoder",
    "componentId": "Zencoder",
    "docsUrl": "zencoder",
    "title": "Zencoder",
    "fullTitle": "Zencoder",
    "group": "application",
    "color": "#E65C2C",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zencoder.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zencoder.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zencoder.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zencoder.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zencoder.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zencoder-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zencoder-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zencoder-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zencoder-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zencoder-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zencoder-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zencoder-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zencoder-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zencoder-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zencoder-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zencoder.webp"
        }
      }
    }
  },
  {
    "iconId": "zenmux",
    "componentId": "ZenMux",
    "docsUrl": "zen-mux",
    "title": "ZenMux",
    "fullTitle": "ZenMux",
    "group": "provider",
    "color": "#000",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zenmux.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zenmux.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zenmux.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zenmux.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zenmux.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zenmux-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zenmux-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zenmux-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zenmux-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zenmux-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zenmux.webp"
        }
      }
    }
  },
  {
    "iconId": "zeroone",
    "componentId": "ZeroOne",
    "docsUrl": "zero-one",
    "title": "01.AI",
    "fullTitle": "01.AI (零一万物)",
    "group": "provider",
    "color": "#003425",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": false,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zeroone.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zeroone.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zeroone.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zeroone.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zeroone.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zeroone-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zeroone-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zeroone-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zeroone-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zeroone-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zeroone.webp"
        }
      }
    }
  },
  {
    "iconId": "zhipu",
    "componentId": "Zhipu",
    "docsUrl": "zhipu",
    "title": "Zhipu",
    "fullTitle": "Zhipu (智谱)",
    "group": "provider",
    "color": "#3859FF",
    "capabilities": {
      "hasAvatar": true,
      "hasBrand": false,
      "hasBrandColor": false,
      "hasColor": true,
      "hasCombine": true,
      "hasText": true,
      "hasTextCn": false,
      "hasTextColor": false
    },
    "variants": {
      "mono": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zhipu.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zhipu.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zhipu.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zhipu.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zhipu.webp"
          }
        }
      },
      "color": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zhipu-color.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zhipu-color.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zhipu-color.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zhipu-color.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zhipu-color.webp"
          }
        }
      },
      "text": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "svg",
          "png",
          "webp"
        ],
        "urls": {
          "svg": "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/zhipu-text.svg",
          "png": {
            "light": "https://unpkg.com/@lobehub/icons-static-png@latest/light/zhipu-text.png",
            "dark": "https://unpkg.com/@lobehub/icons-static-png@latest/dark/zhipu-text.png"
          },
          "webp": {
            "light": "https://unpkg.com/@lobehub/icons-static-webp@latest/light/zhipu-text.webp",
            "dark": "https://unpkg.com/@lobehub/icons-static-webp@latest/dark/zhipu-text.webp"
          }
        }
      },
      "combine": {
        "supported": true,
        "staticSupport": false,
        "formats": [],
        "urls": {}
      },
      "avatar": {
        "supported": true,
        "staticSupport": true,
        "formats": [
          "avatar"
        ],
        "urls": {
          "avatar": "https://unpkg.com/@lobehub/icons-static-avatar@latest/avatars/zhipu.webp"
        }
      }
    }
  }
];
