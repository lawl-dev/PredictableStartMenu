<template>
  <div id="app">
    <div class="suggestions-container" ref="suggestionContainer">
      <div
        v-for="(suggestion, index) of filteredApplicationSuggestions"
        @mouseenter="() => selectionIndex = index"
        @click="() => exec(suggestion)"
        :title="title(suggestion)"
        :class="{ suggestion: true, selected: selectionIndex === index }"
        :key="index"
      >
        <img class="icon" :src="'file://' + suggestion.iconPath" v-if="suggestion.iconPath" />
        <div class="icon" v-else />

        <div class="name">{{ suggestion.name }}</div>
      </div>
    </div>
    <div class="search-container">
      <input
        class="search-input"
        placeholder="Search..."
        ref="searchInput"
        :value="searchTerm"
        @input="($event) => updateSearch($event.target.value)"
        @keydown.up.down.enter="($event) => updateSelectionIndex($event)"
        @blur="() => hide()"
      />
    </div>
  </div>
</template>

<script lang="ts">
import AppViewModel from "@/AppViewModel";
export default AppViewModel;
</script>

<style lang="scss">
.search-container {
  height: 20px;
  padding: 5px;
}

.search-input {
  padding-left: 5px;
  width: 100%;
  height: 100%;
  border: none;
  width: calc(100% - 10px);
  border: 1px solid rgba(0, 0, 0, 0);
  border-radius: 2px;
}

.search-input:focus {
  outline: none !important;
  border: 1px solid #ddd;
  border-radius: 2px;
}

.suggestions-container {
  scroll-snap-type: y mandatory;
  height: 465px;
  padding-left: 5px;
  padding-top: 5px;
  max-height: 465px;
  overflow-y: scroll;
  display: flex;
  flex-flow: column nowrap;
}

.suggestions-container > :first-child {
  margin-top: auto;
}

.suggestions-container::-webkit-scrollbar {
  width: 6px;
  background-color: #f5f5f5;
}

.suggestions-container::-webkit-scrollbar-thumb {
  background-color: #aaa;
}

.suggestion {
  cursor: pointer;
  scroll-snap-align: start;
  display: flex;
  height: 20px;
  padding: 2px;
}

.suggestion.selected {
  background-color: #ddd;
}

.icon {
  padding-right: 10px;
  width: 16px;
  height: 16px;
}
body {
  display: block;
  margin: 0;
}

#app {
  border-left: 1px solid #ddd;
  border-top: 1px solid #ddd;
  border-right: 1px solid #ddd;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
</style>
