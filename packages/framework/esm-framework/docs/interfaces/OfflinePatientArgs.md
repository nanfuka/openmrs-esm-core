[@openmrs/esm-framework](../API.md) / OfflinePatientArgs

# Interface: OfflinePatientArgs

## Table of contents

### Properties

- [patientUuid](OfflinePatientArgs.md#patientuuid)
- [signal](OfflinePatientArgs.md#signal)

## Properties

### patientUuid

• **patientUuid**: `string`

The UUID of the patient that should be made available offline.

#### Defined in

[packages/framework/esm-offline/src/offline-patient-data.ts:70](https://github.com/nanfuka/openmrs-esm-core/blob/master/packages/framework/esm-offline/src/offline-patient-data.ts#L70)

___

### signal

• **signal**: `AbortSignal`

An {@link AbortSignal} which notifies about the cancellation of the operation.

#### Defined in

[packages/framework/esm-offline/src/offline-patient-data.ts:74](https://github.com/nanfuka/openmrs-esm-core/blob/master/packages/framework/esm-offline/src/offline-patient-data.ts#L74)
