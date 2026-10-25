import { describe, expect, it, vi } from "vitest";
import { PageThumbnailService } from "../src/pdf/thumbnails";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("page thumbnails", () => {
  it("renders a page once and serves later requests from the cache", async () => {
    const render = vi.fn(async (page: number) => `data:image/jpeg;base64,page-${page}`);
    const service = new PageThumbnailService(render);
    expect(service.get(1)).toBeNull();

    const [first, second] = await Promise.all([service.request(1), service.request(1)]);
    expect(first).toBe("data:image/jpeg;base64,page-1");
    expect(second).toBe(first);
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.get(1)).toBe(first);

    await expect(service.request(1)).resolves.toBe(first);
    expect(render).toHaveBeenCalledTimes(1);
    service.destroy();
  });

  it("keeps working after a page fails to render", async () => {
    const render = vi.fn(async (page: number) => {
      if (page === 1) throw new Error("cannot render");
      return `data:image/jpeg;base64,page-${page}`;
    });
    const service = new PageThumbnailService(render);
    await expect(service.request(1)).resolves.toBeNull();
    expect(service.get(1)).toBeNull();
    await expect(service.request(2)).resolves.toBe("data:image/jpeg;base64,page-2");
    service.destroy();
  });

  it("discards a preview that finishes after the cache was cleared", async () => {
    let finish!: (url: string) => void;
    const render = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const service = new PageThumbnailService(render);
    const pending = service.request(3);
    await wait(0);
    expect(render).toHaveBeenCalledWith(3);
    service.clear();
    await expect(pending).resolves.toBeNull();
    finish("data:image/jpeg;base64,stale");
    await wait(10);
    expect(service.get(3)).toBeNull();
    service.destroy();
  });

  it("waits for the main renderer to go idle before rasterising", async () => {
    let busy = true;
    const render = vi.fn(async () => "data:image/jpeg;base64,ready");
    const service = new PageThumbnailService(render, () => busy);
    const pending = service.request(2);
    await wait(150);
    expect(render).not.toHaveBeenCalled();
    busy = false;
    await expect(pending).resolves.toBe("data:image/jpeg;base64,ready");
    expect(render).toHaveBeenCalledTimes(1);
    service.destroy();
  });

  it("resolves queued work when destroyed", async () => {
    const service = new PageThumbnailService(async () => "data:image/jpeg;base64,late");
    const pending = service.request(5);
    service.destroy();
    await expect(pending).resolves.toBeNull();
  });
});
