package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

type GreetingResponse struct {
	Message   string `json:"message"`
	UserInput string `json:"user_input"`
	Success   bool   `json:"success"`
}

var rootCmd = &cobra.Command{
	Use:   "qoder-cli",
	Short: "Qoder CLI tool for GitHub Action processing",
	Long:  "A CLI tool that processes user input and generates greetings for GitHub Actions",
}

var greetCmd = &cobra.Command{
	Use:   "greet [input]",
	Short: "Echo user input and generate a friendly greeting",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		userInput := args[0]
		
		// 生成问候消息
		greeting := fmt.Sprintf("Hello! 👋 I received your input: '%s'. Nice to meet you!", userInput)
		
		// 创建响应结构
		response := GreetingResponse{
			Message:   greeting,
			UserInput: userInput,
			Success:   true,
		}
		
		// 输出JSON格式结果
		jsonOutput, err := json.Marshal(response)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
			os.Exit(1)
		}
		
		fmt.Println(string(jsonOutput))
	},
}

func init() {
	rootCmd.AddCommand(greetCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}