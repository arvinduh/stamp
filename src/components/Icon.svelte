<!--
  @component Icon
  Card artwork: a catalog icon by name, an image URL, or a short emoji.
  Unknown names fall back to a star.
-->
<script lang="ts">
  import Star from "@lucide/svelte/icons/star";
  import { CARD_ICONS } from "../lib/card_icons";

  interface Props {
    name: string;
    size?: number;
  }

  let { name, size = 24 }: Props = $props();

  const isImage = $derived(/^(https:\/\/|data:image\/)/.test(name));
  const isEmoji = $derived(
    !CARD_ICONS.has(name) && /\p{Extended_Pictographic}/u.test(name)
  );
  const Glyph = $derived(CARD_ICONS.get(name) ?? Star);
</script>

{#if isImage}
  <img class="icon-image" src={name} alt="" width={size} height={size} />
{:else if isEmoji}
  <span class="icon-emoji" style:font-size={`${size * 0.85}px`}>{name}</span>
{:else}
  <Glyph {size} strokeWidth={2} />
{/if}

<style>
  .icon-image {
    border-radius: 25%;
    object-fit: cover;
  }

  .icon-emoji {
    line-height: 1;
  }
</style>
