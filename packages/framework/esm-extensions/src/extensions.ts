/**
 * We have the following extension modes:
 *
 * - attached (set via code in form of: attach, detach, ...)
 * - configured (set via configuration in form of: added, removed, ...)
 * - assigned (computed from attached and configured)
 * - connected (computed from assigned using connectivity and online / offline)
 */

import {
  ExtensionSlotConfigObject,
  getExtensionSlotConfigStore,
} from "@openmrs/esm-config";
import {
  getExtensionInternalStore,
  ExtensionSlotState,
  AssignedExtension,
  checkStatusFor,
  ConnectedExtension,
} from ".";
import {
  ExtensionRegistration,
  ExtensionSlotInfo,
  ExtensionInternalStore,
  getExtensionStore,
  updateInternalExtensionStore,
} from "./store";

const extensionInternalStore = getExtensionInternalStore();
const extensionStore = getExtensionStore();

// Keep the output store updated
extensionInternalStore.subscribe((internalStore) => {
  const slots: Record<string, ExtensionSlotState> = {};
  for (let [slotName, slot] of Object.entries(internalStore.slots)) {
    if (slot.moduleName) {
      // Only include registered slots
      const assignedExtensions = getAssignedExtensions(slotName);
      slots[slotName] = { moduleName: slot.moduleName, assignedExtensions };
    }
  }
  extensionStore.setState({ slots: slots });
});

function createNewExtensionSlotInfo(
  slotName: string,
  moduleName?: string
): ExtensionSlotInfo {
  return {
    moduleName,
    name: slotName,
    attachedIds: [],
    config: null,
  };
}

/**
 * Given an extension ID, which is a string uniquely identifying
 * an instance of an extension within an extension slot, this
 * returns the extension name.
 *
 * @example
 * ```js
 * getExtensionNameFromId("foo#bar")
 *  --> "foo"
 * getExtensionNameFromId("baz")
 *  --> "baz"
 * ```
 */
export function getExtensionNameFromId(extensionId: string) {
  const [extensionName] = extensionId.split("#");
  return extensionName;
}

export function getExtensionRegistrationFrom(
  state: ExtensionInternalStore,
  extensionId: string
): ExtensionRegistration | undefined {
  const name = getExtensionNameFromId(extensionId);
  return state.extensions[name];
}

export function getExtensionRegistration(
  extensionId: string
): ExtensionRegistration | undefined {
  const state = extensionInternalStore.getState();
  return getExtensionRegistrationFrom(state, extensionId);
}

/**
 * Extensions must be registered in order to be rendered.
 * This is handled by the app shell, when extensions are provided
 * via the `setupOpenMRS` return object.
 * @internal
 */
export const registerExtension: (
  extensionRegistration: ExtensionRegistration
) => void = extensionInternalStore.action(
  (state, extensionRegistration: ExtensionRegistration) => {
    state.extensions[extensionRegistration.name] = {
      ...extensionRegistration,
      instances: {},
    };
  }
);

/**
 * Attach an extension to an extension slot.
 *
 * This will cause the extension to be rendered into the specified
 * extension slot, unless it is removed by configuration. Using
 * `attach` is an alternative to specifying the `slot` or `slots`
 * in the extension declaration.
 *
 * It is particularly useful when creating a slot into which
 * you want to render an existing extension. This enables you
 * to do so without modifying the extension's declaration, which
 * may be impractical or inappropriate, for example if you are
 * writing a module for a specific implementation.
 *
 * @param slotName a name uniquely identifying the slot
 * @param extensionId an extension name, with an optional #-suffix
 *    to distinguish it from other instances of the same extension
 *    attached to the same slot.
 */
export function attach(slotName: string, extensionId: string) {
  updateInternalExtensionStore((state) => {
    const existingSlot = state.slots[slotName];

    if (!existingSlot) {
      return {
        ...state,
        slots: {
          ...state.slots,
          [slotName]: {
            ...createNewExtensionSlotInfo(slotName),
            attachedIds: [extensionId],
          },
        },
      };
    } else {
      return {
        ...state,
        slots: {
          ...state.slots,
          [slotName]: {
            ...existingSlot,
            attachedIds: [...existingSlot.attachedIds, extensionId],
          },
        },
      };
    }
  });
}

/** Avoid using this. Extension attachments should be considered declarative. */
export function detach(extensionSlotName: string, extensionId: string) {
  updateInternalExtensionStore((state) => {
    const existingSlot = state.slots[extensionSlotName];

    if (existingSlot && existingSlot.attachedIds.includes(extensionId)) {
      return {
        ...state,
        slots: {
          ...state.slots,
          [extensionSlotName]: {
            ...existingSlot,
            attachedIds: existingSlot.attachedIds.filter(
              (id) => id !== extensionId
            ),
          },
        },
      };
    } else {
      return state;
    }
  });
}

/** Avoid using this. Extension attachments should be considered declarative. */
export function detachAll(extensionSlotName: string) {
  updateInternalExtensionStore((state) => {
    const existingSlot = state.slots[extensionSlotName];

    if (existingSlot) {
      return {
        ...state,
        slots: {
          ...state.slots,
          [extensionSlotName]: {
            ...existingSlot,
            attachedIds: [],
          },
        },
      };
    } else {
      return state;
    }
  });
}

/**
 * Get an order index for the extension. This will
 * come from either its configured order, its registered order
 * parameter, or the order in which it happened to be attached.
 */
function getOrder(
  extensionId: string,
  configuredOrder: Array<string>,
  registeredOrderIndex: number | undefined,
  attachedOrder: Array<string>
) {
  const configuredIndex = configuredOrder.indexOf(extensionId);
  if (configuredIndex !== -1) {
    return configuredIndex;
  } else if (registeredOrderIndex !== undefined) {
    // extensions that don't have a configured order should appear after those that do
    return 1000 + registeredOrderIndex;
  } else {
    const assignedIndex = attachedOrder.indexOf(extensionId);
    if (assignedIndex !== -1) {
      // extensions that have neither a configured nor registered order should appear
      // after all others
      return 2000 + assignedIndex;
    } else {
      return -1;
    }
  }
}

/**
 * Filters a list of extensions according to whether they support the
 * current connectivity status.
 *
 * @param assignedExtensions The list of extensions to filter.
 * @param online Whether the app is currently online. If `null`, uses `navigator.onLine`.
 * @returns A list of extensions that should be rendered
 */
export function getConnectedExtensions(
  assignedExtensions: Array<AssignedExtension>,
  online: boolean | null = null
): Array<ConnectedExtension> {
  const isOnline = online ?? navigator.onLine;
  return assignedExtensions.filter((e) =>
    checkStatusFor(isOnline, e.online, e.offline)
  );
}

export function getAssignedExtensions(
  slotName: string
): Array<AssignedExtension> {
  const internalState = extensionInternalStore.getState();
  const config = getExtensionSlotConfigStore(slotName).getState().config;
  const attachedIds = internalState.slots[slotName].attachedIds;
  const assignedIds = calculateAssignedIds(config, attachedIds);
  const extensions: Array<AssignedExtension> = [];
  for (let id of assignedIds) {
    const name = getExtensionNameFromId(id);
    const extension = internalState.extensions[name];
    extensions.push({
      id,
      name,
      moduleName: extension.moduleName,
      meta: extension.meta,
      online: extension.online,
      offline: extension.offline,
    });
  }
  return extensions;
}

function calculateAssignedIds(
  config: ExtensionSlotConfigObject,
  attachedIds: Array<string>
) {
  const addedIds = config.add || [];
  const removedIds = config.remove || [];
  const idOrder = config.order || [];
  const { extensions } = extensionInternalStore.getState();

  return [...attachedIds, ...addedIds]
    .filter((id) => !removedIds.includes(id))
    .sort((idA, idB) => {
      const ai = getOrder(
        idA,
        idOrder,
        extensions[getExtensionNameFromId(idA)].order,
        attachedIds
      );
      const bi = getOrder(
        idB,
        idOrder,
        extensions[getExtensionNameFromId(idB)].order,
        attachedIds
      );

      if (bi === -1) {
        return -1;
      } else if (ai === -1) {
        return 1;
      } else {
        return ai - bi;
      }
    });
}

/**
 * Used by by extension slots at mount time.
 *
 * @param moduleName The name of the module that contains the extension slot
 * @param slotName The extension slot name that is actually used
 * @internal
 */
export const registerExtensionSlot: (
  moduleName: string,
  slotName: string
) => void = extensionInternalStore.action((state, moduleName, slotName) => {
  const existingModuleName = state.slots[slotName]?.moduleName;
  if (existingModuleName && existingModuleName != moduleName) {
    console.warn(
      `An extension slot with the name '${slotName}' already exists. Refusing to register the same slot name twice (in "registerExtensionSlot"). The existing one is from module ${existingModuleName}.`
    );
    return state;
  }
  if (existingModuleName && existingModuleName == moduleName) {
    // Re-rendering an existing slot
    return state;
  }
  if (state.slots[slotName]) {
    return {
      ...state,
      slots: {
        ...state.slots,
        [slotName]: {
          ...state.slots[slotName],
          moduleName,
        },
      },
    };
  }
  const slot = createNewExtensionSlotInfo(slotName, moduleName);
  return {
    ...state,
    slots: {
      ...state.slots,
      [slotName]: slot,
    },
  };
});

/**
 * @internal
 * Just for testing.
 */
export const reset: () => void = extensionStore.action(() => {
  return {
    slots: {},
    extensions: {},
  };
});
