<template>
  <div id="app">
    <h1>{{ title }}</h1>
    <p>${{ values.description }}</p>
  </div>
</template>

<script setup>
const title = '${{ values.systemName }}-${{ values.name }}'
</script>
