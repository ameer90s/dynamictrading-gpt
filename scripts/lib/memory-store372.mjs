export function memoryStore372(initial={}){
 const map=new Map(Object.entries(initial).map(([k,v])=>[k,{data:structuredClone(v),etag:'initial:'+k}]));let seq=0;
 return {map,beforeSet:null,beforeRead:null,
  async get(key){if(this.beforeRead)await this.beforeRead(key);return structuredClone(map.get(key)?.data??null);},
  async getWithMetadata(key){if(this.beforeRead)await this.beforeRead(key);return structuredClone(map.get(key)??null);},
  async setJSON(key,data,opt={}){
   if(this.beforeSet)await this.beforeSet(key,data,opt);
   const old=map.get(key);
   if(opt.onlyIfNew&&old||opt.onlyIfMatch&&old?.etag!==opt.onlyIfMatch)return {modified:false};
   const etag=String(++seq);map.set(key,{data:structuredClone(data),etag});return {modified:true,etag};
  }};
}
