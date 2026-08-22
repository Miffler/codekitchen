# codekitchen

Static site scaffolded with `build-site` and deployed to Railway.

## Deploy
1. Create a private GitHub repo named `codekitchen`.
2. `build-site deploy codekitchen --token <ghp_...>`
3. In railway.app: New Project -> Deploy from GitHub -> select `codekitchen`.

## Customize
- Edit `index.html` (theme via CSS vars, content in the body).
- `build-site customize codekitchen --accent #xxxxxx --title "..."`
