declare module "loading.js" {
  type LoadingCallback = (percent: number, done: boolean) => void;

  const loading: (
    images: readonly string[],
    callback?: LoadingCallback,
  ) => void;

  export default loading;
}
