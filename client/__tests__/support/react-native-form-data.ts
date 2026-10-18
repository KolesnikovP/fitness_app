/**
 * React Native uploads a FormData entry shaped { uri, name, type } as the
 * file at that URI. Jest runs on Node's FormData, which would turn the
 * object into the string "[object Object]", so give it the same behaviour:
 * the entry becomes a File with that name and type (its contents are the URI,
 * as there's no device file to read).
 */
type NativeFile = { uri: string; name: string; type: string };

function isNativeFile(value: unknown): value is NativeFile {
  return typeof value === 'object' && value !== null && 'uri' in value && 'name' in value && 'type' in value;
}

const append = FormData.prototype.append;
FormData.prototype.append = function (this: FormData, name: string, value: unknown, ...rest: unknown[]) {
  if (isNativeFile(value)) {
    return append.call(this, name, new File([value.uri], value.name, { type: value.type }) as never);
  }
  return (append as (...args: unknown[]) => void).call(this, name, value, ...rest);
} as typeof FormData.prototype.append;
